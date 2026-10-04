export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "code"; language: "bash" | "powershell" | "text"; title?: string; value: string }
  | { type: "note"; title: string; text: string; tone?: "tip" | "warning" }
  | { type: "table"; columns: string[]; rows: string[][] };

export interface DocSection {
  heading: string;
  blocks: DocBlock[];
}

export interface DocArticle {
  slug: string;
  title: string;
  description: string;
  group: string;
  sections: DocSection[];
}

export interface DocGroup {
  label: string;
  items: DocArticle[];
}

export const docsGroups: DocGroup[] = [
  {
    label: "Getting started",
    items: [
      {
        slug: "getting-started", title: "Getting started", description: "Install Torque and follow your first torrent from inspection to completion.", group: "Getting started",
        sections: [
          { heading: "A short first run", blocks: [
            { type: "paragraph", text: "Torque is a desktop BitTorrent client. It uses a Rust service and librqbit for transfers, with a React interface in the Tauri desktop shell." },
            { type: "steps", items: ["Install Torque from a published release, or build it from source.", "Choose Add Torrent and provide a magnet link, a local .torrent file, or an HTTP/HTTPS torrent URL.", "Wait for metadata to resolve, inspect the file tree, choose the files and destination, then press Start Download.", "Follow progress in Downloads; open a torrent for file and connection details."] },
            { type: "note", title: "Inspection is a separate step", text: "Resolving metadata shows torrent contents. It does not start the download. The transfer begins only after you confirm Start Download." },
          ] },
          { heading: "Pick a lawful source", blocks: [
            { type: "paragraph", text: "Use torrents from sources you trust and content you are legally authorized to access. Browse currently includes Internet Archive items that meet Torque's supported open-license filters." },
            { type: "paragraph", text: "Your recent torrent list and preferences are stored locally by the desktop app. Torrent payloads stay in the destination you choose." },
          ] },
        ],
      },
      {
        slug: "installation", title: "Installation", description: "Install a published desktop build or prepare a system for building Torque.", group: "Getting started",
        sections: [
          { heading: "Install from GitHub Releases", blocks: [
            { type: "paragraph", text: "Open the Torque GitHub Releases page and choose an installer that matches your operating system and architecture. When release assets are available, Windows installers are published as MSI or NSIS packages." },
            { type: "note", title: "No asset for your platform?", text: "Release assets are added by maintainers. If none is listed, build from source or check again after a release is published." },
          ] },
          { heading: "Build prerequisites", blocks: [
            { type: "list", items: ["Node.js 22 or newer with Corepack/pnpm for the desktop frontend.", "Rust 1.90 or newer and the native compiler toolchain.", "Windows: Microsoft C++ Build Tools, Windows SDK, and Edge WebView2 Runtime.", "macOS: Xcode Command Line Tools.", "Linux: WebKitGTK and the Tauri system libraries for your distribution."] },
            { type: "paragraph", text: "Tauri's platform prerequisites page lists the operating-system packages required by the current Tauri version." },
          ] },
        ],
      },
      {
        slug: "running-the-app", title: "Running the application", description: "Launch the desktop app or run the independent marketing and documentation site.", group: "Getting started",
        sections: [
          { heading: "Desktop application", blocks: [
            { type: "paragraph", text: "From the repository root, install the pinned frontend packages once, then start Vite and Tauri together. The native shell is required for torrent commands and native file/folder pickers." },
            { type: "code", language: "bash", title: "Repository root", value: "corepack enable\ncorepack prepare pnpm@11.19.0 --activate\npnpm install --frozen-lockfile\npnpm tauri:dev" },
            { type: "note", title: "`pnpm dev` alone is not the desktop app", text: "It only starts the desktop UI's Vite server. Rust commands and Tauri APIs need `pnpm tauri:dev`." },
          ] },
          { heading: "Marketing and documentation site", blocks: [
            { type: "paragraph", text: "The separate Vite website in `frontend/` does not need Tauri or the Rust engine. Run it with npm from that directory." },
            { type: "code", language: "bash", title: "Website", value: "cd frontend\nnpm install\nnpm run dev" },
          ] },
        ],
      },
      {
        slug: "building-from-source", title: "Building from source", description: "Build Torque for the current operating system and run the project checks.", group: "Getting started",
        sections: [
          { heading: "Desktop build", blocks: [
            { type: "code", language: "bash", title: "Build from repository root", value: "pnpm install --frozen-lockfile\npnpm tauri:build" },
            { type: "paragraph", text: "Tauri runs the frontend production build and creates native packages for the current operating system. Build on each target OS to create its native release package." },
            { type: "list", items: ["Frontend type check: `pnpm typecheck`", "Rust formatting: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`", "Rust compile check: `cargo check --manifest-path src-tauri/Cargo.toml`", "Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`"] },
          ] },
          { heading: "Website build", blocks: [
            { type: "code", language: "bash", title: "Independent static website", value: "cd frontend\nnpm install\nnpm run build\nnpm run preview" },
            { type: "paragraph", text: "The static site output is written to `frontend/dist/`. Its router uses clean paths, so configure your static host to serve `index.html` for route requests. A Netlify `_redirects` file is included." },
          ] },
        ],
      },
    ],
  },
  {
    label: "Using Torque",
    items: [
      {
        slug: "adding-torrents", title: "Adding torrents", description: "Choose a magnet, local .torrent file, or web URL and inspect it first.", group: "Using Torque",
        sections: [
          { heading: "Three input methods", blocks: [
            { type: "table", columns: ["Input", "What to provide", "Before transfer"], rows: [["Magnet", "A magnet URI with an info hash", "Torque resolves metadata first"], ["Torrent file", "A local `.torrent` file", "Metainfo is parsed locally"], ["Torrent URL", "An HTTP or HTTPS link to metainfo", "Torrent bytes are fetched and parsed"]] },
            { type: "steps", items: ["Press Add Torrent and choose an input type.", "Choose the destination folder. Your last folder is remembered; Settings can ask every time.", "Review metadata and the file list. No content download begins during inspection.", "Select files and press Start Download to create the engine session."] },
          ] },
          { heading: "Useful checks before you start", blocks: [
            { type: "paragraph", text: "Torque checks for a duplicate info hash, totals the selected size, checks available destination space where the platform supports it, and summarizes file types." },
            { type: "note", title: "Executable and script files", tone: "warning", text: "Torque may show a neutral trust reminder for executable or script extensions. An extension by itself is not a malware finding." },
          ] },
        ],
      },
      {
        slug: "magnet-links", title: "Using magnet links", description: "Resolve magnet metadata before selecting files or starting a transfer.", group: "Using Torque",
        sections: [
          { heading: "Inspect a magnet", blocks: [
            { type: "paragraph", text: "Paste a `magnet:?` URI in Add Torrent. Torque validates the URI, then asks librqbit to resolve its metainfo before a content session is started." },
            { type: "paragraph", text: "While peers or DHT provide metadata, Torque shows a fetching state. A magnet that has no reachable source for metadata may time out or fail; retry when the source becomes available." },
            { type: "note", title: "Metadata is not file data", text: "The inspection request can contact peers to get the torrent metadata. It does not ask the engine to download the torrent's selected content." },
          ] },
        ],
      },
      {
        slug: "torrent-urls", title: "Using torrent URLs", description: "Add remote torrent metainfo over HTTP or HTTPS.", group: "Using Torque",
        sections: [
          { heading: "Add a URL", blocks: [
            { type: "paragraph", text: "Use a direct HTTP or HTTPS URL that returns a `.torrent` file. Torque fetches the metainfo in Rust, validates it, and opens the regular inspection workflow." },
            { type: "list", items: ["Only HTTP and HTTPS schemes are accepted.", "A normal HTML page is not torrent metainfo; use a link to the `.torrent` asset itself.", "Network errors and invalid metainfo are displayed in Add Torrent so you can correct the source."] },
          ] },
        ],
      },
      {
        slug: "choosing-download-location", title: "Choosing a download location", description: "Set a default folder or pick a different destination for each torrent.", group: "Using Torque",
        sections: [
          { heading: "Choose where data is saved", blocks: [
            { type: "paragraph", text: "Torque opens the native folder picker when you select Change Folder. The selected directory is registered by the Rust service and represented in the UI by an opaque identifier; the frontend does not receive unrestricted filesystem access." },
            { type: "list", items: ["Change the default folder in Settings.", "Turn on Ask for destination every time to choose a folder before each inspection.", "A torrent keeps the destination chosen when that download was started.", "If a stored directory is missing, Torque reports the location issue rather than crashing at launch."] },
          ] },
        ],
      },
      {
        slug: "inspecting-torrent-files", title: "Inspecting torrent files", description: "Review exact metadata and nested files before starting a torrent.", group: "Using Torque",
        sections: [
          { heading: "What the preview shows", blocks: [
            { type: "paragraph", text: "The preview reports the name, info hash, total size, piece count when available, tracker information when available, privacy status when available, and the torrent's ordered file list." },
            { type: "paragraph", text: "Files are arranged by their relative paths. Each file has a checkbox; folders summarize their descendants. The selected file count and size update as the selection changes." },
            { type: "note", title: "Start is explicit", text: "Inspection does not create a download. The torrent is registered with the active engine only when you press Start Download." },
          ] },
          { heading: "Preflight information", blocks: [
            { type: "list", items: ["File-type counts and sizes for common media and document types.", "A neutral notice for executable or script extensions.", "A selected-size versus available-space estimate where supported.", "A duplicate-library match when the info hash is already known."] },
          ] },
        ],
      },
      {
        slug: "selecting-files", title: "Selecting files", description: "Choose individual files, toggle whole folders, and change selection later.", group: "Using Torque",
        sections: [
          { heading: "Choose the files you want", blocks: [
            { type: "list", items: ["Use a file checkbox for an individual path.", "Use a folder checkbox to select or deselect all files under that folder.", "A folder displays an indeterminate state when some, but not all, descendant files are selected.", "Select All and Select None apply to the whole torrent."] },
            { type: "paragraph", text: "The selected file count and size stay visible. Search and sort help with long lists; folder checkboxes act on matching files when a search is active." },
          ] },
          { heading: "Change selection later", blocks: [
            { type: "paragraph", text: "Open the Files tab of an active or paused torrent, adjust the selection, and save. Torque sends stable file indexes to librqbit. Completed sessions can be changed only while the engine keeps them available." },
            { type: "note", title: "Piece boundaries", text: "BitTorrent pieces can span file boundaries. A small amount of data belonging to an unselected file may be needed to verify a selected piece; Torque does not select those files for saving." },
          ] },
        ],
      },
      {
        slug: "managing-downloads", title: "Managing downloads", description: "Pause, resume, retry, open a folder, or remove a torrent safely.", group: "Using Torque",
        sections: [
          { heading: "Actions on a torrent", blocks: [
            { type: "table", columns: ["State", "Available action"], rows: [["Downloading", "Pause or remove"], ["Paused", "Resume or remove"], ["Completed", "Open folder or remove from list"], ["Error", "Retry when possible or remove"], ["Queued", "Reorder, then wait for a slot"]] },
            { type: "paragraph", text: "Removing a torrent from Torque keeps downloaded files. The separate Delete downloaded files action removes torrent-owned data and asks for confirmation by default." },
          ] },
          { heading: "Open a completed folder", blocks: [
            { type: "paragraph", text: "Use Open folder on a completed torrent. The Rust service resolves the directory from the managed torrent session and passes it to the native opener; the frontend cannot request arbitrary command execution." },
          ] },
        ],
      },
      {
        slug: "torrent-details", title: "Torrent details", description: "Open the detailed view for progress, files, peers, trackers, and info.", group: "Using Torque",
        sections: [
          { heading: "Five focused tabs", blocks: [
            { type: "table", columns: ["Tab", "Information"], rows: [["Overview", "Progress, selected bytes, rates, ETA, ratio, peers, date, destination, state"], ["Files", "Path, size, progress, downloaded amount, selection, status"], ["Peers", "Privacy-masked address and client when available"], ["Trackers", "Tracker URL and status where provided"], ["Info", "Info hash, pieces, creation metadata, privacy, source, location"]] },
            { type: "paragraph", text: "The overview and file progress reuse the existing status snapshot. Less-frequently used peer and metainfo details are loaded when the detail view opens or when you refresh it." },
          ] },
          { heading: "Values the engine does not expose", blocks: [
            { type: "paragraph", text: "Some fields vary by source and engine API. Torque leaves unavailable values blank or labels them unavailable; it does not infer per-peer speed, announce timing, or seed-only counts." },
          ] },
        ],
      },
      {
        slug: "searching-content", title: "Searching content", description: "Search configured lawful sources, compare results, and inspect without auto-downloading.", group: "Using Torque",
        sections: [
          { heading: "Search and compare", blocks: [
            { type: "paragraph", text: "Browse sends queries to registered Rust `SearchProvider` implementations. The interface receives normalized results with provider, category, size, description, date, counts, and trust metadata only when the source supplies them." },
            { type: "list", items: ["Filter by provider or category.", "Sort by relevance, newest, size, or seeders when available.", "Open result details to review license and source context.", "Choose Inspect Torrent to continue through metadata preview and explicit selection."] },
          ] },
          { heading: "Current provider", blocks: [
            { type: "paragraph", text: "Torque currently registers an Internet Archive adapter using its documented search and metadata APIs. Results are limited to items whose metadata includes supported open-license information and a listed archive torrent file." },
            { type: "note", title: "Discovery never starts a transfer", text: "A result click opens details. Inspecting resolves metainfo; only Start Download begins content transfer." },
          ] },
        ],
      },
      {
        slug: "settings", title: "Settings", description: "Set destinations, startup behavior, queue concurrency, bandwidth, appearance, and confirmations.", group: "Using Torque",
        sections: [
          { heading: "Downloads", blocks: [
            { type: "list", items: ["Default download location and Ask for destination every time.", "Start downloads automatically and resume unfinished transfers on launch.", "Maximum simultaneous torrents from 1 to 64 (default 3).", "Confirm before removing a torrent and before deleting downloaded files.", "Keep Torque in the system tray when closing the window, where tray icons are supported."] },
            { type: "paragraph", text: "Preferences and queue order are stored in application state under the operating system's Tauri app-data directory. Download payloads are not copied into this preference file." },
          ] },
          { heading: "Appearance", blocks: [
            { type: "paragraph", text: "Choose System, Dark, or Light in the desktop application. The marketing and documentation website has its own independent dark/light toggle and remembers the choice in browser storage." },
          ] },
        ],
      },
      {
        slug: "keyboard-shortcuts", title: "Keyboard shortcuts", description: "Use the implemented desktop shortcuts without interrupting normal form entry.", group: "Using Torque",
        sections: [
          { heading: "Shortcuts", blocks: [
            { type: "table", columns: ["Shortcut", "Action"], rows: [["Ctrl/Cmd + O", "Open the native torrent file picker"], ["Ctrl/Cmd + V", "Read a magnet link from the clipboard when focus is outside an editable field"], ["Ctrl/Cmd + F", "Open Browse and focus search"], ["Space", "Pause or resume the selected/focused torrent while its row has focus"], ["Delete", "Remove the selected torrent using the configured confirmation"]] },
            { type: "paragraph", text: "Shortcut modifiers are platform-aware. Shortcuts avoid taking normal typing or button activation away from form controls and dialogs." },
          ] },
        ],
      },
    ],
  },
  {
    label: "Advanced",
    items: [
      {
        slug: "download-queue", title: "Download queue", description: "Understand waiting positions, automatic advancement, and simultaneous-download limits.", group: "Advanced",
        sections: [
          { heading: "Queue order and position", blocks: [
            { type: "paragraph", text: "Unfinished downloads keep a persisted queue order. Waiting torrents show their position and can move up, down, to the top, or to the bottom. The next waiting torrent starts automatically when a slot opens." },
            { type: "paragraph", text: "Paused torrents are not treated as waiting until you resume them. If all slots are occupied, a resumed torrent is placed in the waiting queue." },
          ] },
          { heading: "Concurrency", blocks: [
            { type: "paragraph", text: "Maximum simultaneous downloads accepts 1–64 and defaults to 3. Lowering the setting pauses lower-priority active torrents into the queue; raising it lets the scheduler fill new slots." },
            { type: "note", title: "Startup behavior", text: "When Resume on launch is enabled, Torque restarts unfinished torrents in saved order up to the configured limit. Remaining downloads wait in the queue." },
          ] },
        ],
      },
      {
        slug: "bandwidth-limits", title: "Bandwidth limits", description: "Set global download and upload rates for the shared librqbit session.", group: "Advanced",
        sections: [
          { heading: "Global caps", blocks: [
            { type: "paragraph", text: "Settings provides separate Download limit and Upload limit controls. Choose Unlimited or enter a custom amount in KB/s or MB/s." },
            { type: "paragraph", text: "Torque applies these values through librqbit's session rate limiter. The values are shared by all torrents in this application session." },
          ] },
          { heading: "Per-torrent limits", blocks: [
            { type: "note", title: "Not currently supported", text: "librqbit does not expose a per-torrent runtime rate cap through the API Torque uses. Torque does not emulate one with a separate throttling system." },
          ] },
        ],
      },
      {
        slug: "torrent-metadata", title: "Torrent metadata", description: "Learn what the preview and Info tab can report from metainfo and librqbit.", group: "Advanced",
        sections: [
          { heading: "Fields from metainfo", blocks: [
            { type: "list", items: ["Name, stable info hash, and total size.", "Ordered file paths and exact file sizes.", "Piece length and count when present.", "Tracker URLs and private/public flag when available.", "Creation metadata when present in the torrent."] },
            { type: "paragraph", text: "Local .torrent files and torrent URLs are parsed before registering a transfer. Magnet inputs use librqbit's metadata resolution, without starting selected file content." },
          ] },
          { heading: "Stable file indexes", blocks: [
            { type: "paragraph", text: "File selection is mapped to each file's index in the metainfo order. The service validates those indexes before passing them to librqbit's `only_files` or `update_only_files` APIs." },
          ] },
        ],
      },
      {
        slug: "trackers-and-peers", title: "Trackers and peers", description: "See the connection information librqbit can report without exposing full peer addresses.", group: "Advanced",
        sections: [
          { heading: "Peer information", blocks: [
            { type: "paragraph", text: "When the engine returns peer details, Torque masks addresses before the frontend receives them (IPv4 subnet only, IPv6 /64, no port). Client name and lifetime byte counters are shown where provided." },
            { type: "paragraph", text: "The librqbit APIs used by Torque do not expose per-peer rates or completion percentages. Those fields are not estimated." },
          ] },
          { heading: "Tracker information", blocks: [
            { type: "paragraph", text: "Tracker URLs and status can appear in a torrent's detail view when librqbit provides them. Announce timestamps, next-announce times, and per-tracker peer counts are not available through the current integration." },
          ] },
        ],
      },
    ],
  },
  {
    label: "Help",
    items: [
      {
        slug: "troubleshooting", title: "Troubleshooting", description: "Resolve common setup, metadata, destination, and queue issues.", group: "Help",
        sections: [
          { heading: "Setup and launch", blocks: [
            { type: "table", columns: ["Problem", "What to try"], rows: [["Rust commands unavailable", "Start `pnpm tauri:dev`; `pnpm dev` is only the frontend server."], ["Windows native build fails", "Install Desktop development with C++, a Windows SDK, and WebView2 Runtime."], ["Linux WebKit library error", "Install the Tauri WebKitGTK/system packages for the distribution."], ["Corepack reports EPERM", "Corepack needs permission to install shims beside Node. Run it from an Administrator terminal once, or use an existing pnpm installation."]] },
          ] },
          { heading: "Torrent input or transfer", blocks: [
            { type: "list", items: ["A magnet may fail if no peer or DHT source can provide metadata; retry later.", "A torrent URL must use HTTP/HTTPS and return valid metainfo, not a web page.", "If the destination has moved, choose an available location in Settings. Existing torrents keep their saved folder.", "A duplicate info hash opens the existing library item rather than creating a second session.", "If no download slot is free, a new or resumed torrent waits in the queue."] },
          ] },
          { heading: "State recovery", blocks: [
            { type: "paragraph", text: "If application state is unreadable, Torque keeps the damaged file aside and loads defaults. rqbit restores its session separately; a torrent whose session cannot be recovered can remain visible as unavailable." },
          ] },
        ],
      },
      {
        slug: "faq", title: "FAQ", description: "Quick answers about file inspection, privacy, releases, and supported sources.", group: "Help",
        sections: [
          { heading: "Common questions", blocks: [
            { type: "table", columns: ["Question", "Answer"], rows: [["Does selecting a result start downloading?", "No. A result opens its details. Inspect Torrent fetches metadata; Start Download is the explicit transfer action."], ["Can I select just one file?", "Yes. Select files or folders before starting, and update file selections later where the session permits."], ["Can Torque cap one torrent only?", "Not through the current librqbit API; speed limits are global to the session."], ["Does Torque host installers?", "No. Published installers are linked from GitHub Releases."], ["Is all content in Browse verified legal?", "No. Provider metadata can identify supported license claims, but Torque does not independently verify every rights claim."]] },
          ] },
        ],
      },
    ],
  },
];

export const allDocs = docsGroups.flatMap((group) => group.items);
export function findDoc(slug: string | undefined): DocArticle | undefined {
  return allDocs.find((article) => article.slug === slug);
}
