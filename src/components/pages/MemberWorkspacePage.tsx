import React, { useState, useRef, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { DashboardNote } from "../../types";
import { formatPossessiveName, formatCleanName } from "../../utils/formatters";
import {
  User,
  Plus,
  Trash2,
  Check,
  Edit2,
  Search,
  ExternalLink,
  Folder,
  FolderPlus,
  Globe,
  Link as LinkIcon,
  StickyNote,
  FileText,
  ArrowLeft,
  ChevronRight,
  Calendar,
  X,
  GripVertical,
  Download,
  BookMarked,
  AlertCircle
} from "lucide-react";
import { NORLAN_WORKSPACE_SEED } from "../../data/norlanWorkspaceSeed";

// â”€â”€ Live drag-from-bookmarks-bar extractor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Reads from the browser's native dataTransfer when a bookmark is dragged
// directly from the bookmarks bar or bookmarks manager into the portal.
// Supports Chrome/Edge (text/uri-list) and Firefox (text/x-moz-url with title).

interface DroppedLink { url: string; title: string; }

function extractDroppedLinks(e: DragEvent | React.DragEvent): DroppedLink[] {
  const dt = e.dataTransfer;
  if (!dt) return [];

  // Firefox: "text/x-moz-url" = "URL\nTitle\nURL\nTitle\nâ€¦" (pairs per line)
  const mozUrl = dt.getData("text/x-moz-url");
  if (mozUrl) {
    const lines = mozUrl.split("\n").map((s) => s.trim()).filter(Boolean);
    const results: DroppedLink[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      const url = lines[i];
      const title = lines[i + 1] || url;
      if (url.startsWith("http")) results.push({ url, title });
    }
    if (results.length) return results;
  }

  // Chrome/Edge: text/uri-list (one URL per line; title may be in text/html)
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    const htmlSnippet = dt.getData("text/html") || "";
    // Try to pull a title from the <a> in the HTML snippet
    const titleMatch = htmlSnippet.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const htmlTitle = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    const urls = uriList
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter((u) => u && !u.startsWith("#") && u.startsWith("http"));

    return urls.map((url) => ({ url, title: htmlTitle || url }));
  }

  // Fallback: plain text URL
  const plain = dt.getData("text/plain") || "";
  if (plain.startsWith("http")) {
    return [{ url: plain.trim(), title: plain.trim() }];
  }

  return [];
}

// â”€â”€ Browser bookmark HTML parser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Standard format produced by Chrome, Firefox, Edge, and Safari.
// Structure: <DL> â†’ <DT><H3>FolderName</H3><DL>â€¦</DL>  or  <DT><A href=â€¦>Title</A>

interface ParsedBookmark {
  title: string;
  url?: string;
  isFolder?: boolean;
  children?: ParsedBookmark[];
}

function parseBookmarkHtml(html: string): ParsedBookmark[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function parseDL(dl: Element): ParsedBookmark[] {
    const results: ParsedBookmark[] = [];
    const children = Array.from(dl.children);
    for (const child of children) {
      if (child.tagName !== "DT") continue;
      const h3 = child.querySelector(":scope > H3");
      const a  = child.querySelector(":scope > A");
      const nestedDl = child.querySelector(":scope > DL");

      if (h3) {
        results.push({
          title: h3.textContent?.trim() || "Untitled Folder",
          isFolder: true,
          children: nestedDl ? parseDL(nestedDl) : [],
        });
      } else if (a) {
        const href = a.getAttribute("href") || "";
        if (!href || href.startsWith("place:") || href.startsWith("javascript:")) continue;
        results.push({
          title: a.textContent?.trim() || href,
          url: href,
          isFolder: false,
        });
      }
    }
    return results;
  }

  const topDl = doc.querySelector("DL");
  return topDl ? parseDL(topDl) : [];
}

function flattenToNotes(
  items: ParsedBookmark[],
  memberId: string,
  today: string,
  prefix: string = "bm",
  parentFolderId?: string
): DashboardNote[] {
  const notes: DashboardNote[] = [];
  let counter = Date.now();

  function process(list: ParsedBookmark[], pfId?: string) {
    for (const item of list) {
      const id = `${prefix}-${counter++}`;
      if (item.isFolder) {
        const folderNote: DashboardNote = {
          id,
          title: item.title,
          content: "",
          itemType: "folder",
          category: "General",
          entity: "TI",
          memberId,
          status: "open",
          createdAt: today,
          ...(pfId ? { folderId: pfId } : {}),
        };
        notes.push(folderNote);
        if (item.children && item.children.length > 0) {
          process(item.children, id);
        }
      } else if (item.url) {
        notes.push({
          id,
          title: item.title,
          content: "",
          itemType: "link",
          url: item.url,
          category: "General",
          entity: "TI",
          memberId,
          status: "open",
          createdAt: today,
          ...(pfId ? { folderId: pfId } : {}),
        });
      }
    }
  }

  process(items, parentFolderId);
  return notes;
}

interface MemberWorkspacePageProps {
  memberId: string;
  memberName: string;
  memberColor?: string;
}

export const MemberWorkspacePage: React.FC<MemberWorkspacePageProps> = ({
  memberId,
  memberName: initialMemberName,
  memberColor = "#1a73e8"
}) => {
  const {
    theme,
    quickNotes,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    setActiveMember,
    bulkSeedWorkspace,
    reorderQuickNotes
  } = useFinance();
  const isLight = theme === "light";

  // Editable Member Name State
  const [currentMemberName, setCurrentMemberName] = useState(formatCleanName(initialMemberName));
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedNameInput, setEditedNameInput] = useState(formatCleanName(initialMemberName));

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<"all" | "note" | "link" | "folder">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [itemType, setItemType] = useState<"note" | "link" | "folder">("note");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [targetFolderId, setTargetFolderId] = useState<string>("");

  // Drag-to-reorder state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragMode = useRef(false);

  // Bookmark import state (HTML file)
  const bookmarkInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<DashboardNote[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");

  // Live drag-from-browser-bar state
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [recentDrops, setRecentDrops] = useState<DroppedLink[]>([]);
  const [dropSuccess, setDropSuccess] = useState<number>(0); // count of last batch added
  const dropSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean current display name
  const displayName = formatCleanName(currentMemberName);
  const possessiveTitle = `${formatPossessiveName(displayName)} Workspace`;

  // Filter notes/links/folders strictly for this member
  const memberItems = quickNotes.filter(
    (n) => n.memberId === memberId || (n.entity as string) === memberId
  );

  // Folders for dropdown/navigation
  const folders = memberItems.filter((i) => i.itemType === "folder");

  // Whether Norlan's seed is already loaded
  const seedAlreadyLoaded = memberItems.some((i) => i.id === "seed-f-dashboards");

  // Auto-load Norlan's Tabme links on first visit (runs once when the seed is absent)
  useEffect(() => {
    if (memberId === "mem-norlan" && !seedAlreadyLoaded) {
      bulkSeedWorkspace(NORLAN_WORKSPACE_SEED);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const handleSaveNameEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedNameInput.trim()) return;
    const cleaned = formatCleanName(editedNameInput);
    setCurrentMemberName(cleaned);
    setActiveMember({ id: memberId, name: cleaned, color: memberColor });
    setIsEditingName(false);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    let formattedUrl = newUrl.trim();
    if (itemType === "link" && formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    addQuickNote({
      title: newTitle.trim(),
      content: newContent.trim(),
      itemType,
      url: itemType === "link" ? formattedUrl : undefined,
      folderId: targetFolderId || (selectedFolderId ?? undefined),
      category: itemType === "folder" ? "Folder" : newCategory || "General",
      entity: "TI",
      memberId: memberId,
      status: "open",
      createdAt: new Date().toISOString().split("T")[0]
    });

    setNewTitle("");
    setNewUrl("");
    setNewContent("");
    setTargetFolderId("");
    setIsAddModalOpen(false);
  };

  // Filter items based on activeTab, selectedFolderId, and searchTerm
  const filteredItems = memberItems.filter((item) => {
    if (selectedFolderId) {
      if (item.id === selectedFolderId) return false;
      if (item.folderId !== selectedFolderId) return false;
    } else {
      if (item.itemType !== "folder" && item.folderId) return false;
    }

    if (activeTab === "note" && (item.itemType || "note") !== "note") return false;
    if (activeTab === "link" && item.itemType !== "link") return false;
    if (activeTab === "folder" && item.itemType !== "folder") return false;

    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      (item.content && item.content.toLowerCase().includes(q)) ||
      (item.url && item.url.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const selectedFolderObj = folders.find((f) => f.id === selectedFolderId);

  // â”€â”€ Drag-to-reorder handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragMode.current = true;
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    // Needed for Firefox
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    dragMode.current = false;
    if (!srcId || srcId === targetId) return;

    const oldOrder = filteredItems.map((i) => i.id);
    const srcIdx = oldOrder.indexOf(srcId);
    const tgtIdx = oldOrder.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const newOrder = [...oldOrder];
    newOrder.splice(srcIdx, 1);
    newOrder.splice(tgtIdx, 0, srcId);

    reorderQuickNotes(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    dragMode.current = false;
  };

  // â”€â”€ Bookmark import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleBookmarkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError("");
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const html = ev.target?.result as string;
        const parsed = parseBookmarkHtml(html);
        if (parsed.length === 0) {
          setImportError("No bookmarks found in this file. Make sure it's a browser bookmark export (.html).");
          return;
        }
        const today = new Date().toISOString().split("T")[0];
        const notes = flattenToNotes(parsed, memberId, today);
        setImportPreview(notes);
      } catch {
        setImportError("Could not parse bookmark file. Please export from your browser as HTML and try again.");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const confirmImport = () => {
    if (!importPreview) return;
    bulkSeedWorkspace(importPreview);
    setImportPreview(null);
    setImportFileName("");
  };

  const cancelImport = () => {
    setImportPreview(null);
    setImportFileName("");
    setImportError("");
  };

  const folderCount = importPreview?.filter((n) => n.itemType === "folder").length ?? 0;
  const linkCount = importPreview?.filter((n) => n.itemType === "link").length ?? 0;

  // â”€â”€ Live drop-from-bookmarks-bar handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDropZoneDragOver = (e: React.DragEvent) => {
    // Only activate for bookmark / URI drops, not our own card reordering
    const types = Array.from(e.dataTransfer.types);
    const isBookmark =
      types.includes("text/uri-list") ||
      types.includes("text/x-moz-url") ||
      types.includes("text/plain");
    if (!isBookmark) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropZoneActive(true);
  };

  const handleDropZoneDragLeave = () => setDropZoneActive(false);

  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropZoneActive(false);

    const links = extractDroppedLinks(e);
    if (links.length === 0) return;

    const today = new Date().toISOString().split("T")[0];
    const newNotes: DashboardNote[] = links.map((lnk, i) => ({
      id: `bm-drop-${Date.now()}-${i}`,
      title: lnk.title,
      content: "",
      itemType: "link" as const,
      url: lnk.url,
      folderId: selectedFolderId ?? undefined,
      category: "General",
      entity: "TI",
      memberId,
      status: "open" as const,
      createdAt: today,
    }));

    bulkSeedWorkspace(newNotes);
    setRecentDrops(links);
    setDropSuccess(links.length);

    if (dropSuccessTimer.current) clearTimeout(dropSuccessTimer.current);
    dropSuccessTimer.current = setTimeout(() => {
      setDropSuccess(0);
      setRecentDrops([]);
    }, 3500);
  };

  // Drag-handle style helper
  const dragBorderClass = (id: string) =>
    dragOverId === id && draggedId !== id
      ? "border-[#1a73e8] ring-2 ring-[#1a73e8]/30"
      : "";

  const dragOpacityClass = (id: string) =>
    draggedId === id ? "opacity-40 scale-95" : "opacity-100 scale-100";

  // â”€â”€ Shared card renderer used by both flat and organised views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderItemCard = (item: DashboardNote) => {
    const type = item.itemType || "note";
    const isDragged = draggedId === item.id;
    const isDragOver = dragOverId === item.id && draggedId !== item.id;
    const dragProps = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, item.id),
      onDragOver: (e: React.DragEvent) => handleDragOver(e, item.id),
      onDrop: (e: React.DragEvent) => handleDrop(e, item.id),
      onDragEnd: handleDragEnd,
    };
    const dragHandle = (
      <span
        className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-[#444] hover:text-slate-500 dark:hover:text-[#666] select-none shrink-0"
        title="Drag to reorder"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </span>
    );

    if (type === "folder") {
      const subItemsCount = memberItems.filter((i) => i.folderId === item.id).length;
      return (
        <div
          key={item.id}
          {...dragProps}
          onClick={() => { if (!isDragged) setSelectedFolderId(item.id); }}
          className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 cursor-pointer transition-all
            ${isLight ? "bg-white border-slate-200 hover:bg-slate-50" : "bg-[#0d111a] border-[#1a2235]"}
            ${isDragOver ? "border-[#1a73e8] ring-2 ring-[#1a73e8]/30 shadow-[0_0_0_2px_rgba(26,115,232,.2)]" : "hover:border-[#1a73e8] shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"}
            ${isDragged ? "opacity-40 scale-95" : "opacity-100 scale-100"}
          `}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Folder className="w-5 h-5 fill-amber-500/20" />
              </div>
              <div>
                <h4 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{item.title}</h4>
                <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-gray-400"}`}>
                  {subItemsCount} item{subItemsCount === 1 ? "" : "s"} inside
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {dragHandle}
              <button
                onClick={(e) => { e.stopPropagation(); deleteQuickNote(item.id); }}
                className="text-slate-400 hover:text-red-500 p-1"
                title="Delete Folder"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {item.content && (
            <p className={`text-xs line-clamp-2 ${isLight ? "text-slate-600" : "text-gray-300"}`}>{item.content}</p>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#222] text-[11px] text-blue-600 dark:text-blue-400 font-bold">
            <span>Open Folder</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      );
    }

    if (type === "link") {
      let domain = "";
      try {
        if (item.url) domain = new URL(item.url).hostname.replace(/^www\./, "");
      } catch {
        domain = item.url || "";
      }
      return (
        <div
          key={item.id}
          {...dragProps}
          className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 transition-all
            ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}
            ${isDragOver ? "border-[#1a73e8] ring-2 ring-[#1a73e8]/30 shadow-[0_0_0_2px_rgba(26,115,232,.2)]" : "shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"}
            ${isDragged ? "opacity-40 scale-95" : "opacity-100 scale-100"}
          `}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Globe className="w-3 h-3" /> {item.category || "URL Link"}
              </span>
              <div className="flex items-center gap-1">
                {dragHandle}
                <button
                  onClick={() => deleteQuickNote(item.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="Delete Link"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <h4 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{item.title}</h4>
            {item.content && (
              <p className={`text-xs mt-1 leading-relaxed ${isLight ? "text-slate-600" : "text-gray-300"}`}>{item.content}</p>
            )}
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-[#1a73e8] text-xs font-bold border border-blue-500/20 transition-colors break-all"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[200px]">{domain || item.url}</span>
              </a>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#222] text-[11px] text-slate-400">
            <span className="flex items-center gap-1 font-mono">
              <Calendar className="w-3 h-3" /> {item.createdAt}
            </span>
          </div>
        </div>
      );
    }

    // NOTE CARD
    return (
      <div
        key={item.id}
        {...dragProps}
        className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 transition-all
          ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}
          ${isDragOver ? "border-[#1a73e8] ring-2 ring-[#1a73e8]/30 shadow-[0_0_0_2px_rgba(26,115,232,.2)]" : "shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"}
          ${isDragged ? "opacity-40 scale-95" : "opacity-100 scale-100"}
        `}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400">
              {item.category || "General Note"}
            </span>
            <div className="flex items-center gap-1">
              {dragHandle}
              <button
                onClick={() => deleteQuickNote(item.id)}
                className="text-slate-400 hover:text-red-500 transition-colors"
                title="Delete Note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <h4 className={`text-sm font-bold ${item.status === "done" ? "line-through text-slate-400" : isLight ? "text-slate-900" : "text-white"}`}>
            {item.title}
          </h4>
          {item.content && (
            <p className={`text-xs mt-1 leading-relaxed whitespace-pre-line ${isLight ? "text-slate-600" : "text-gray-300"}`}>
              {item.content}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#222] text-[11px] text-slate-400">
          <span className="flex items-center gap-1 font-mono">
            <Calendar className="w-3 h-3" /> {item.createdAt}
          </span>
          <button
            onClick={() => {
              if (item.status === "done") {
                updateQuickNote(item.id, { status: "open", completedAt: undefined });
              } else {
                updateQuickNote(item.id, {
                  status: "done",
                  completedAt: new Date().toISOString().split("T")[0]
                });
              }
            }}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
              item.status === "done"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
            }`}
          >
            <Check className="w-3 h-3" />
            {item.status === "done" ? "Done" : "Mark Done"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title={possessiveTitle}
        bgClass="bg-[#1a73e8]"
        moduleId="member-workspace"
        showEntityPills={false}
        onAddClick={() => setIsAddModalOpen(true)}
        addLabel="Add Note / Link / Folder"
      />

      {/* Top Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} shrink-0`}>
        {/* Workspace Identity */}
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" style={{ backgroundColor: memberColor }} />
          {isEditingName ? (
            <form onSubmit={handleSaveNameEdit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={editedNameInput}
                onChange={(e) => setEditedNameInput(e.target.value)}
                className={`px-2 py-1 text-xs border rounded-md font-bold ${
                  isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                } focus:outline-none focus:border-[#1a73e8]`}
                autoFocus
              />
              <button type="submit" className="px-2 py-1 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold rounded-md flex items-center gap-1">
                <Check className="w-3 h-3" /> Save
              </button>
              <button type="button" onClick={() => setIsEditingName(false)} className="px-2 py-1 bg-slate-200 dark:bg-[#222] text-xs font-bold rounded-md">
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold">{formatPossessiveName(displayName)} Personal Space</span>
              <button
                onClick={() => { setEditedNameInput(displayName); setIsEditingName(true); }}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#222] text-slate-400 hover:text-[#1a73e8] transition-colors"
                title="Edit Label / Member Name"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isLight ? "bg-slate-100 text-slate-600" : "bg-[#222] text-gray-300"}`}>
            {memberItems.length} total
          </span>
          {/* Norlan-only: Load My Links from Tabme */}
          {memberId === "mem-norlan" && !seedAlreadyLoaded && (
            <button
              onClick={() => bulkSeedWorkspace(NORLAN_WORKSPACE_SEED)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold transition-colors"
              title="Load links imported from your Tabme bookmark manager"
            >
              <Download className="w-3 h-3" /> Load My Links
            </button>
          )}
          {/* Import Bookmarks from browser export (all members) */}
          <button
            onClick={() => bookmarkInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-400 border border-violet-500/30 text-[10px] font-bold transition-colors"
            title="Import bookmarks from a browser bookmark HTML export (Chrome, Firefox, Edge)"
          >
            <BookMarked className="w-3 h-3" /> Import Bookmarks
          </button>
          <input
            ref={bookmarkInputRef}
            type="file"
            accept=".html,.htm"
            className="hidden"
            onChange={handleBookmarkFileChange}
          />
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: "all", label: "All Items", icon: StickyNote },
              { id: "note", label: "Notes", icon: FileText },
              { id: "link", label: "URLs / Links", icon: LinkIcon },
              { id: "folder", label: "Folders", icon: Folder }
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "bg-[#1a73e8] text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                    : isLight
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    : "bg-[#1e1e1e] hover:bg-[#2a2a2a] text-[#aaa]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-56">
          <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${displayName}'s items...`}
            className={`w-full pl-8 pr-3 py-1 text-xs border rounded-lg ${
              isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
            }`}
          />
        </div>
      </div>

      {/* Breadcrumb Navigation if inside folder */}
      {selectedFolderId && selectedFolderObj && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs font-bold ${isLight ? "bg-blue-50/50 border-blue-100 text-blue-900" : "bg-[#141d2b] border-[#1e2a3a] text-blue-300"}`}>
          <button onClick={() => setSelectedFolderId(null)} className="flex items-center gap-1 text-[#1a73e8] hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Root Space
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
          <span>{selectedFolderObj.title}</span>
        </div>
      )}

      {/* Bookmark Drop Zone + drag-reorder hint bar */}
      <div
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropZoneDrop}
        className={`relative px-4 py-2 border-b text-[10px] flex items-center justify-between gap-2 transition-colors
          ${dropZoneActive
            ? "bg-violet-500/15 border-violet-400 dark:border-violet-500"
            : isLight
            ? "bg-slate-50 border-slate-200 text-slate-400"
            : "bg-[#0a0e17] border-[#111827] text-[#555]"
          }`}
      >
        {/* Left: drop prompt */}
        <span className={`flex items-center gap-1.5 font-semibold transition-colors ${dropZoneActive ? "text-violet-600 dark:text-violet-400" : ""}`}>
          <BookMarked className="w-3 h-3" />
          {dropZoneActive
            ? "Release to add bookmark(s) here"
            : "Drop bookmarks from your browser bar here to add them instantly"}
        </span>

        {/* Right: reorder hint */}
        {filteredItems.length > 1 && !searchTerm && (
          <span className="flex items-center gap-1 shrink-0">
            <GripVertical className="w-3 h-3" /> Drag cards to reorder
          </span>
        )}

        {/* Success flash */}
        {dropSuccess > 0 && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold animate-pulse">
            âœ“ {dropSuccess} bookmark{dropSuccess !== 1 ? "s" : ""} added
          </span>
        )}
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredItems.length === 0 ? (
          <div className={`text-center py-16 border rounded-2xl p-8 space-y-3 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
              {activeTab === "folder" ? <Folder className="w-6 h-6" /> : activeTab === "link" ? <LinkIcon className="w-6 h-6" /> : <User className="w-6 h-6" />}
            </div>
            <h3 className="text-sm font-bold">{displayName}'s Workspace is empty for this view</h3>
            <p className={`text-xs max-w-sm mx-auto ${isLight ? "text-slate-500" : "text-gray-400"}`}>
              No items found. Click below to add a note, URL link, or folder specifically for {displayName}.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
              >
                <Plus className="w-4 h-4" /> Add Item for {displayName}
              </button>
              {memberId === "mem-norlan" && !seedAlreadyLoaded && (
                <button
                  onClick={() => bulkSeedWorkspace(NORLAN_WORKSPACE_SEED)}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs inline-flex items-center gap-1.5 border border-amber-500/30 transition-colors"
                >
                  <Download className="w-4 h-4" /> Load My Links from Tabme
                </button>
              )}
              <button
                onClick={() => bookmarkInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-600 dark:text-violet-400 font-bold text-xs inline-flex items-center gap-1.5 border border-violet-500/30 transition-colors"
              >
                <BookMarked className="w-4 h-4" /> Import Browser Bookmarks
              </button>
            </div>
          </div>
        ) : activeTab === "all" ? (
          /* â”€â”€ Organised view: Folders â†’ URLs & Links â†’ Notes â”€â”€ */
          <div className="space-y-6">
            {(
              [
                { key: "folder" as const, label: "Folders",      Icon: Folder,     color: "text-amber-500"  },
                { key: "link"   as const, label: "URLs & Links", Icon: Globe,      color: "text-emerald-500" },
                { key: "note"   as const, label: "Notes",        Icon: StickyNote, color: "text-blue-400"   },
              ]
            ).map(({ key, label, Icon, color }) => {
              const section = filteredItems.filter((i) =>
                key === "note" ? (!i.itemType || i.itemType === "note") : i.itemType === key
              );
              if (section.length === 0) return null;
              return (
                <div key={key}>
                  <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
                    <span className="text-[10px] text-slate-400 ml-0.5">({section.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {section.map(renderItemCard)}
                  </div>
                </div>
              );
            })}
            {filteredItems.length === 0 && (
              <p className="text-center py-12 text-sm text-slate-400">Nothing here yet â€” add a note, link, or folder.</p>
            )}
          </div>
        ) : (
          /* â”€â”€ Flat grid for type-filtered tabs â”€â”€ */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredItems.map(renderItemCard)}
          </div>

        )}
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-xl border p-5 space-y-4 shadow-2xl ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#2d2d2d] text-white"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#1a2235]">
              <h3 className="text-sm font-bold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Plus className="w-4 h-4" /> Add Item for {displayName}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-3 text-xs">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Item Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "note", label: "Note", icon: StickyNote },
                      { id: "link", label: "URL / Link", icon: LinkIcon },
                      { id: "folder", label: "Folder", icon: Folder }
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    const isSel = itemType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setItemType(t.id)}
                        className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                          isSel
                            ? "bg-[#1a73e8] text-white border-[#1a73e8]"
                            : isLight
                            ? "bg-slate-100 border-slate-300 text-slate-700"
                            : "bg-[#1e1e1e] border-[#333] text-[#aaa]"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {itemType === "folder" ? "Folder Name *" : itemType === "link" ? "Link Title *" : "Note Title *"}
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={
                    itemType === "folder"
                      ? "e.g. Weekly Financial Reports"
                      : itemType === "link"
                      ? "e.g. Master Payroll Google Sheet"
                      : "Note title..."
                  }
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                  }`}
                />
              </div>

              {/* URL (for links) */}
              {itemType === "link" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">URL / Web Link *</label>
                  <input
                    type="text"
                    required
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className={`w-full border rounded-lg p-2 text-xs ${
                      isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                    }`}
                  />
                </div>
              )}

              {/* Category (for notes & links) */}
              {itemType !== "folder" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. General, Priority, Reminders, QBO"
                    className={`w-full border rounded-lg p-2 text-xs ${
                      isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                    }`}
                  />
                </div>
              )}

              {/* Folder Selector */}
              {folders.length > 0 && itemType !== "folder" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Place Inside Folder (Optional)</label>
                  <select
                    value={targetFolderId}
                    onChange={(e) => setTargetFolderId(e.target.value)}
                    className={`w-full border rounded-lg p-2 text-xs ${
                      isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                    }`}
                  >
                    <option value="">Root (No Folder)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        ðŸ“ {f.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Details */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Additional remarks or details..."
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1a2235]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-gray-300"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold"
                >
                  Add {itemType === "folder" ? "Folder" : itemType === "link" ? "Link" : "Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Bookmark Import Error Toast */}
      {importError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold shadow-xl max-w-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{importError}</span>
          <button onClick={() => setImportError("")} className="ml-2 text-white/70 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bookmark Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-lg rounded-xl border p-5 space-y-4 shadow-2xl ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#2d2d2d] text-white"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#1a2235]">
              <h3 className="text-sm font-bold flex items-center gap-2 text-violet-600 dark:text-violet-400">
                <BookMarked className="w-4 h-4" /> Import Browser Bookmarks
              </h3>
              <button onClick={cancelImport} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className={`rounded-lg p-3 border flex items-start gap-3 ${isLight ? "bg-violet-50 border-violet-200" : "bg-violet-900/10 border-violet-500/20"}`}>
                <BookMarked className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-violet-600 dark:text-violet-400">File: {importFileName}</p>
                  <p className={isLight ? "text-slate-600 mt-1" : "text-gray-400 mt-1"}>
                    Found <strong>{folderCount} folder{folderCount !== 1 ? "s" : ""}</strong> and{" "}
                    <strong>{linkCount} link{linkCount !== 1 ? "s" : ""}</strong> to import.
                    All items will be added to {displayName}'s workspace.
                  </p>
                </div>
              </div>

              {/* Preview: top-level folders */}
              <div>
                <p className="font-semibold text-slate-500 mb-1.5">Top-level folders:</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importPreview
                    .filter((n) => n.itemType === "folder" && !n.folderId)
                    .map((folder) => {
                      const childCount = importPreview.filter((n) => n.folderId === folder.id).length;
                      return (
                        <div key={folder.id} className={`flex items-center gap-2 px-2 py-1 rounded ${isLight ? "bg-slate-50" : "bg-[#1a1a1a]"}`}>
                          <Folder className="w-3.5 h-3.5 text-amber-500" />
                          <span className="truncate">{folder.title}</span>
                          <span className={`ml-auto text-[10px] ${isLight ? "text-slate-400" : "text-gray-500"}`}>{childCount} items</span>
                        </div>
                      );
                    })}
                  {/* Root-level links (not in any folder) */}
                  {(() => {
                    const rootLinks = importPreview.filter((n) => n.itemType === "link" && !n.folderId);
                    return rootLinks.length > 0 ? (
                      <div className={`flex items-center gap-2 px-2 py-1 rounded ${isLight ? "bg-slate-50" : "bg-[#1a1a1a]"}`}>
                        <LinkIcon className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-slate-500 dark:text-gray-400">{rootLinks.length} link{rootLinks.length !== 1 ? "s" : ""} at root level</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-gray-500"}`}>
                â„¹ï¸ Already-imported items (same ID) will be skipped. You can delete any unwanted items afterward.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1a2235]">
              <button
                onClick={cancelImport}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-gray-300"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Import {folderCount + linkCount} Items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
