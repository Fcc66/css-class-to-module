
import * as vscode from 'vscode';
import transform from './utils';

let isTransforming = false;

/**
 * 处理类名转换的逻辑
 * @returns 
 */
async function onHandleClassNameTransform() {
	// 如果正在转换，则直接退出
	if (isTransforming) {return;}
	isTransforming = true;

	const editor = vscode.window.activeTextEditor;

	// 如果没有打开编辑器，则直接退出
	if (!editor) {return;}

	const { document } = editor;

	// 读取用户配置
	const config = vscode.workspace.getConfiguration('cssclass2module');
	const configLangIds = config.get<string[]>('supportedLanguageIds', []);
	const supportedLanguageIds = configLangIds.length ? configLangIds :
	 ['javascriptreact', 'typescriptreact'];
	const currentFilePath = document.fileName;
	// 获取工作区根目录
  const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';

	// 如果当前文档不是React组件，则直接退出
	if (!supportedLanguageIds.includes(document.languageId)) {return;}

	// 获取整个文件的文本
	const fullText = document.getText();

	let transformedText = '';
	let hasUpdated = false;
	try {
		({ code: transformedText, hasUpdated } = await transform(fullText, {
			...config,
			currentFilePath,
			rootPath,
			languageId: document.languageId
		}));
	} catch (error) {
		console.error('转换文件失败:', error);
	}

	// 如果没有更新，则直接退出
	if (!hasUpdated) {
		isTransforming = false;
		return;
	}

	// 如果转换后的文本为空，则使用原文本（防止转换出错，清空原文本）
	transformedText = transformedText || fullText;

	// 替换文档内容
	editor.edit(editBuilder => {
		const entireRange = new vscode.Range(
			document.positionAt(0),
			document.positionAt(fullText.length)
		);
		editBuilder.replace(entireRange, transformedText);
	});

	// 保存文档
	await document.save();

	// 延迟一下，防止document.save又触发onWillSaveTextDocument事件
	setTimeout(() => {
		isTransforming = false;
	}, 30);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const disposable1 = vscode.commands.registerCommand('cssclass2module.class2module', (event) => {
		onHandleClassNameTransform();
	});

	vscode.workspace.onWillSaveTextDocument(() => {
		onHandleClassNameTransform();
	});

	context.subscriptions.push(disposable1);
}

// This method is called when your extension is deactivated
export function deactivate() {}
