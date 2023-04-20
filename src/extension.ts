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

class CompileCommandsTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
	private fileTree: TreeNode[] = [];
	private rootPath: string | undefined;
	constructor() {
		// const files = vscode.workspace.findFiles('**/compile_commands.json');
		let compileCommandsPath = "build/compile_commands.json";
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

		var dbPath = path.join(this.rootPath, compileCommandsPath);
		if (!this._pathExists(dbPath)) {
			dbPath = path.join(this.rootPath, "build", compileCommandsPath);
			if (!this._pathExists(dbPath)) {
				return;
			}
		}

		const fileContent = fs.readFileSync(dbPath, 'utf-8');
		const compileCommands: Command[] = JSON.parse(fileContent);

		var projectPath = path.parse(this.rootPath);

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
		if ('file' === element.type) {
			return {
				label: `${element.name}`,
				iconPath: new vscode.ThemeIcon('file'),
				command: {
					command: OPEN_FILE_COMMAND,
					title: "Open File",
					arguments: [vscode.Uri.file(element.path)]
				}
			};
		} else {
			return {
				label: element.name,
				collapsibleState: element.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
				iconPath: new vscode.ThemeIcon('folder')
			};
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new CompileCommandsTreeDataProvider();
	vscode.window.registerTreeDataProvider('projectExplorer', provider);
}

// this method is called when your extension is deactivated
export function deactivate() { }
