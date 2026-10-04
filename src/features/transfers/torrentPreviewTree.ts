export interface TorrentTreeDataFile {
  index: number;
  path: string;
  filename: string;
  sizeBytes: string;
  selected: boolean;
}

export interface TorrentTreeFile {
  type: "file";
  id: string;
  name: string;
  file: TorrentTreeDataFile;
}

export interface TorrentTreeDirectory {
  type: "directory";
  id: string;
  name: string;
  children: TorrentTreeNode[];
  fileIndices: number[];
  totalSize: bigint;
  totalFiles: number;
  childMap: Map<string, TorrentTreeNode>;
}

export type TorrentTreeNode = TorrentTreeFile | TorrentTreeDirectory;

export interface TorrentPreviewTree {
  roots: TorrentTreeNode[];
  directories: TorrentTreeDirectory[];
  ancestorsByFile: Map<number, string[]>;
}

export function buildTorrentPreviewTree(files: TorrentTreeDataFile[]): TorrentPreviewTree {
  const roots: TorrentTreeNode[] = [];
  const directories: TorrentTreeDirectory[] = [];
  const rootMap = new Map<string, TorrentTreeNode>();
  const ancestorsByFile = new Map<number, string[]>();

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let children = roots;
    let childMap = rootMap;
    const ancestors: TorrentTreeDirectory[] = [];

    for (const part of parts.slice(0, -1)) {
      const key = `directory:${part}`;
      let node = childMap.get(key);
      if (!node || node.type !== "directory") {
        node = {
          type: "directory",
          id: `directory:${[...ancestors.map((item) => item.name), part].join("/")}`,
          name: part,
          children: [],
          fileIndices: [],
          totalSize: 0n,
          totalFiles: 0,
          childMap: new Map(),
        };
        childMap.set(key, node);
        children.push(node);
        directories.push(node);
      }
      ancestors.push(node);
      children = node.children;
      childMap = node.childMap;
    }

    const leafName = parts.at(-1)!;
    const leaf: TorrentTreeFile = {
      type: "file",
      id: `file:${file.index}`,
      name: leafName,
      file,
    };
    childMap.set(leaf.id, leaf);
    children.push(leaf);

    ancestorsByFile.set(file.index, ancestors.map((directory) => directory.id));
    for (const directory of ancestors) {
      directory.fileIndices.push(file.index);
      directory.totalSize += BigInt(file.sizeBytes);
      directory.totalFiles += 1;
    }
  }

  const compare = (left: TorrentTreeNode, right: TorrentTreeNode) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  };
  function sort(nodes: TorrentTreeNode[]) {
    nodes.sort(compare);
    for (const node of nodes) {
      if (node.type === "directory") sort(node.children);
    }
  }
  sort(roots);

  return { roots, directories, ancestorsByFile };
}
