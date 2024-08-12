const fs = require('fs');
const path = require('path');
const generate = require("@babel/generator").default;
const parser = require("@babel/parser");
const traverse = require('@babel/traverse').default;
const t = require("@babel/types");
const prettier = require('prettier');
const { prettierConfig: defaultPrettierConfig } = require('../config/index');

// 解析选项
const parseOptions = {
  plugins: ['jsx', 'typescript'],
  sourceType: 'module',
};

/**
 * 检查文件是否存在，如果不存在则创建文件
 * @param filePath 
 * @returns 
 */
async function accessFileAndCreateIfNotExist(filePath: string) {
  try {
    // 尝试访问文件
    fs.accessSync(filePath, fs.constants.F_OK);
  } catch (err) {
    // 如果文件不存在，创建它
    console.log('样式文件不存在，正在创建...');
    fs.writeFileSync(filePath, ''); // 创建一个空文件
  }
}

/**
 * 导入文件和生成文件
 * 如果要导入的文件不存在，则创建文件
 * @param ast 
 * @param config 
 */
function handleImportFile(ast: any, config = {} ) {
  const { currentFilePath, stylesImportPath, stylesName } = (config || {}) as any;

  // 导入文件的路径
  const importDeclaration = t.importDeclaration(
    [t.importDefaultSpecifier(t.identifier(stylesName))],
    t.stringLiteral(stylesImportPath)
  );

  // 将新的导入声明插入到AST的最顶部
  ast.program.body.unshift(importDeclaration);

  // 如果不存在该文件，创建文件
  const stylesFilePath = path.join(path.dirname(currentFilePath), stylesImportPath);
  accessFileAndCreateIfNotExist(stylesFilePath);
}

/**
 * 在样式文件中添加缺失的className
 * @param config 
 * @param classNames 
 */
async function addClassNameInStylesFile(config: any, classNames: Set<string>) {;
  const { currentFilePath, stylesImportPath } = (config || {}) as any;
  const stylesFilePath = path.join(path.dirname(currentFilePath), stylesImportPath);
  let stylesContent = '';

  await accessFileAndCreateIfNotExist(stylesFilePath);

  try {
    stylesContent = fs.readFileSync(stylesFilePath, 'utf8');
  } catch (err) {
    console.log('读取样式文件失败');
    return;
  }

  // 检查并添加缺失的className
  let updated = false;
  classNames.forEach(className => {
    if (!stylesContent.includes(`.${className}`)) {
      stylesContent += `\n.${className} {}\n`; // 添加缺失的className
      updated = true;
    }
  });

  // 如果有更新，则写回文件
  if (updated) {
    const writeErr = fs.writeFileSync(stylesFilePath, stylesContent);

    if (writeErr) {
      console.log('写入样式文件失败');
      return;
    }
  }
}

/**
 * 使用Prettier格式化代码
 * @param code 
 * @param config 
 * @returns 
 */
async function prettierFormat(code: string, config: any) {
  const { rootPath, languageId } = (config || {}) as any;

  // 构建.prettierrc文件的完整路径
  const prettierConfigPath = `${rootPath}/.prettierrc`;

  // 尝试读取.prettierrc配置
  let prettierConfig = {};
  try {
    const prettierConfigRaw = fs.readFileSync(prettierConfigPath, 'utf8');
    prettierConfig = JSON.parse(prettierConfigRaw);
  } catch (error) {
    console.log('未找到.prettierrc文件，将使用默认配置');
  }

  // 使用Prettier格式化代码
  const formattedCode = await prettier.format(code, {
    ...(prettierConfig || defaultPrettierConfig),
    parser: languageId === 'typescriptreact' ? 'typescript' : 'babel', // 明确指定解析器
  });

  return formattedCode;
}

/**
 * 把react里的className属性转换为styles对象的属性
 * @param code 
 */
async function transform(jsxCode: string, config: any = {}): Promise<{
  code: string,
  hasUpdated: boolean,
  classNames: Set<string>,
}> {
  const { stylesName = 'styles', isAddClassName } = (config || {}) as any;

  // 解析JSX代码
  const ast = parser.parse(jsxCode, parseOptions);
  let hasStylesImport = false;
  const classNames = new Set<string>(); // 用于收集className

  // 遍历AST
  traverse(ast, {
    JSXAttribute(path: any) {
      const className = path.node.value.value;
      if (path.node.name.name === "className" && typeof className === 'string') {
        classNames.add(className); // 收集className

        // 创建一个新的JSX表达式容器
        const expression = t.jsxExpressionContainer(
          t.memberExpression(t.identifier(stylesName), t.stringLiteral(path.node.value.value), true)
        );
        // 替换原来的值
        path.node.value = expression;
      }
    },
    ImportDeclaration(path: any) {
      if (
        path.node.source.value.includes('module') &&
        path.node.specifiers.some((specifier: any) => specifier.local.name === stylesName)
      ) {
        hasStylesImport = true;
      }
    }
  });

  // 如果没有导入styles，则添加导入语句
  if (!hasStylesImport) {
    handleImportFile(ast, config);
  }

  // 在样式文件中添加缺失的className
  if (isAddClassName) {addClassNameInStylesFile(config, classNames);}

  // 生成新的代码
  let { code } = generate(ast);

  code = await prettierFormat(code, config);

  return {
    code,
    hasUpdated: classNames.size > 0,
    classNames,
  };
}

export default transform;
