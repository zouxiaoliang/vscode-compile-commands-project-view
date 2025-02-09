// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface Command {
	directory: string;
	file: string;
	target: string;
	command: string;
}

interface TreeNode {
	name: string,
	path: string,
	type: string,
	command?: Command,
	children?: TreeNode[];
}

const OPEN_FILE_COMMAND = 'extension.openFile';
const compileCommandsPath = "compile_commands.json";
class CompileCommandsTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
	private fileTree: TreeNode[] = [];

	private rootPath: string | undefined;
	private disposable: vscode.Disposable | undefined;
	private compileCommandsPath: string | undefined;

	private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined> = new vscode.EventEmitter<TreeNode | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> = this._onDidChangeTreeData.event;

	constructor() {
		this.rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0)) ?
			vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;


		vscode.commands.registerCommand(OPEN_FILE_COMMAND, (resource) => {
			vscode.workspace.openTextDocument(resource.fsPath).then((doc) => {
				vscode.window.showTextDocument(doc);
			});
		});

		if (!this.rootPath) {
			return;
		}
		this.refresh();

		this.watchCompileCommandsJson();
	}

	dispose() {
		this.disposable?.dispose();
	}

	public refresh() {
		this.fileTree = [];
		var dbPath = path.join(this.rootPath ?? "", compileCommandsPath);
		if (!this._pathExists(dbPath)) {
			dbPath = path.join(this.rootPath ?? "", "build", compileCommandsPath);
			if (!this._pathExists(dbPath)) {
				return;
			}
		}
		this.compileCommandsPath = dbPath;

		const fileContent = fs.readFileSync(dbPath, 'utf-8');
		const compileCommands: Command[] = JSON.parse(fileContent);

		var projectPath = path.parse(this.rootPath ?? "");

		compileCommands.forEach((command) => {
			var filePath = command.file;
			var basePath = path.relative(projectPath.dir, filePath);
			if (!basePath.startsWith("/")) {
				basePath = "/" + basePath;
			}
			const r = path.parse(basePath);

			// 根据文件的目录结构，递归地创建目录树结构
			this.createDirectory(this.fileTree, r.dir.split(path.sep), r.base, filePath, command);
		});

		this._onDidChangeTreeData.fire(undefined);
	}

	private watchCompileCommandsJson() {
		// 监听 compile_commands.json 文件的变化
		const watcher = vscode.workspace.createFileSystemWatcher(this.compileCommandsPath ?? "");
		this.disposable = vscode.Disposable.from(watcher);

		watcher.onDidChange(() => {
			console.log('compile_commands.json has changed. Refreshing the tree...');
			this.refresh();
		});
	}

	private createDirectory(nodes: TreeNode[], directories: string[], fileName: string, filePath: string, command: Command) {
		var currentDirectory = directories[1];
		directories.shift();

		if (!currentDirectory) {
			// 如果没有子目录了，就将文件添加到当前目录下
			nodes.push({
				name: fileName,
				path: filePath,
				type: 'file',
			});
		} else {
			// 如果还有子目录，就递归创建子目录
			let currentNode = nodes.find((node) => node.name === currentDirectory);

			if (!currentNode) {
				currentNode = {
					name: currentDirectory,
					path: '',
					type: 'folder',
					children: [],
				};

				nodes.push(currentNode);
			}

			this.createDirectory(currentNode.children!, directories, fileName, filePath, command);
		}
	}

	private _pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}

		return true;
	}

	getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
		if (!element) {
			return this.fileTree;
		} else {
			const children = element.children ?? [];
			return children.map((child) => child as TreeNode);
		}
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		// TODO: 应用图标主题的图标
		if ('file' === element.type) {
			let icon: vscode.ThemeIcon;
			const ext = element.name.split('.').pop();
			switch (ext) {
				case '':
					icon = new vscode.ThemeIcon('file');
					break;
				case 'c':
				case 'cpp':
				case 'h':
				case 'hpp':
					icon = new vscode.ThemeIcon('file-code');
					break;
				default:
					icon = new vscode.ThemeIcon('file');
			}
			return {
				label: `${element.name}`,
				iconPath: icon,
				command: {
					command: OPEN_FILE_COMMAND,
					title: "Open File",
					arguments: [vscode.Uri.file(element.path)]
				}
			};
		} else {
			return {
				label: element.name,
				collapsibleState: element.children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
				iconPath: new vscode.ThemeIcon('folder')
			};
		}
	}

	public collapseAll(): void {
		this._onDidChangeTreeData.fire(undefined);
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new CompileCommandsTreeDataProvider();
	vscode.window.registerTreeDataProvider('projectExplorer', provider);

	const collapseAllCommandId = 'compileCommandsExplorer.collapseAll';
	const collapseAllCommandHandler = () => {
		provider.collapseAll();
	};

	const refreshCommandId = "compileCommandsExplorer.refresh";
	const refreshCommandIdHandler = () => {
		provider.refresh();
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(collapseAllCommandId, collapseAllCommandHandler),
		vscode.commands.registerCommand(refreshCommandId, refreshCommandIdHandler)
	);

	vscode.window.createTreeView('projectExplorer', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	const refreshButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	refreshButton.text = "$(sync) Refresh Compile Commands";
	refreshButton.command = "compileCommandsExplorer.refresh";
	refreshButton.show();

}

// this method is called when your extension is deactivated
export function deactivate() { }
