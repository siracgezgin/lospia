"use client";

/**
 * LexicalTemplateEditor — client-only rich text editor for the Şablon
 * Kütüphanesi. Built on @lexical/react (MIT, Meta) following the composer +
 * plugins pattern from the official examples (example/lexical-main was used
 * as reference only; no code was copied).
 *
 * Kept deliberately small: bold / italic / underline / lists / heading /
 * link / clear formatting, plus quick-insert chips for {{değişken}} tokens.
 * On every change the parent receives the serialized editor state (JSON),
 * generated HTML (for rich clipboard copy) and plain text (for search +
 * plain copy). No dangerouslySetInnerHTML anywhere — the HTML output is only
 * ever written to the clipboard.
 */

import { useCallback, useEffect, useState } from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $generateHtmlFromNodes } from "@lexical/html";
import { $setBlocksType } from "@lexical/selection";
import { HeadingNode, QuoteNode, $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import {
  ListNode, ListItemNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { LinkNode, AutoLinkNode, TOGGLE_LINK_COMMAND, $isLinkNode } from "@lexical/link";
import { $getNearestNodeOfType } from "@lexical/utils";
import {
  Bold, Italic, Underline, List as ListIcon, ListOrdered, Heading2, Link2, RemoveFormatting,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface TemplateEditorValue {
  json: string;
  html: string;
  text: string;
}

interface Props {
  /** Serialized Lexical editor state (content_json) — null for a new template. */
  initialJson?: string | null;
  /** Fallback when there is no editor state yet (e.g. legacy plain records). */
  initialPlainText?: string | null;
  onChange: (value: TemplateEditorValue) => void;
  readOnly?: boolean;
  /** {{token}} quick-insert chips shown under the toolbar. */
  variableSuggestions?: string[];
}

const EDITOR_THEME = {
  paragraph: "mb-1.5",
  heading: {
    h2: "mb-2 mt-2 text-[16px] font-semibold text-ink",
    h3: "mb-1.5 mt-1.5 text-[14.5px] font-semibold text-ink",
  },
  list: {
    ul: "mb-1.5 ml-5 list-disc",
    ol: "mb-1.5 ml-5 list-decimal",
    listitem: "mb-0.5",
  },
  link: "text-brand underline",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
  },
};

function ToolbarButton({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ variableSuggestions }: { variableSuggestions: string[] }) {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState({
    bold: false, italic: false, underline: false, heading: false, link: false,
  });

  const refreshFormats = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const anchorNode = selection.anchor.getNode();
    const element =
      anchorNode.getKey() === "root" ? anchorNode : anchorNode.getTopLevelElementOrThrow();
    const linkParent = $getNearestNodeOfType(anchorNode, LinkNode);
    setFormats({
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      underline: selection.hasFormat("underline"),
      heading: $isHeadingNode(element),
      link: $isLinkNode(linkParent),
    });
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => { refreshFormats(); return false; },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, refreshFormats]);

  function toggleHeading() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root" ? anchorNode : anchorNode.getTopLevelElementOrThrow();
      if ($isHeadingNode(element)) $setBlocksType(selection, () => $createParagraphNode());
      else $setBlocksType(selection, () => $createHeadingNode("h2"));
    });
  }

  function toggleLink() {
    if (formats.link) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }
    const url = window.prompt("Bağlantı adresi (https://…):", "https://");
    if (!url || !/^https?:\/\//i.test(url.trim())) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim());
  }

  function clearFormatting() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      for (const node of selection.getNodes()) {
        if ($isTextNode(node)) {
          node.setFormat(0);
          node.setStyle("");
        }
      }
      $setBlocksType(selection, () => $createParagraphNode());
    });
  }

  function insertToken(token: string) {
    editor.focus();
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(token);
    });
  }

  return (
    <div className="border-b border-line bg-surface-muted/50">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <ToolbarButton title="Kalın" active={formats.bold} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton title="İtalik" active={formats.italic} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton title="Altı çizili" active={formats.underline} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}>
          <Underline size={14} />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolbarButton title="Başlık" active={formats.heading} onClick={toggleHeading}>
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton title="Madde listesi" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>
          <ListIcon size={14} />
        </ToolbarButton>
        <ToolbarButton title="Numaralı liste" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>
          <ListOrdered size={14} />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolbarButton title="Bağlantı" active={formats.link} onClick={toggleLink}>
          <Link2 size={14} />
        </ToolbarButton>
        <ToolbarButton title="Biçimi temizle" onClick={clearFormatting}>
          <RemoveFormatting size={14} />
        </ToolbarButton>
      </div>
      {variableSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t border-line/60 px-2 py-1.5">
          <span className="mr-1 text-[10.5px] text-subtle">Değişken ekle:</span>
          {variableSuggestions.map((v) => (
            <button
              key={v}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertToken(v)}
              className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-muted transition-colors hover:bg-brand-soft hover:text-brand-strong"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LexicalTemplateEditor({
  initialJson, initialPlainText, onChange, readOnly = false, variableSuggestions = [],
}: Props) {
  // Composer config is captured on first mount (Lexical requirement); the
  // modal remounts the editor per template, so that is exactly what we want.
  const [initialConfig] = useState(() => ({
    namespace: "TemplateEditor",
    theme: EDITOR_THEME,
    editable: !readOnly,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
    onError(error: Error) {
      // Never crash the form over an editor hiccup; the error boundary below
      // keeps the rest of the modal usable.
      console.error("Şablon editörü hatası:", error);
    },
    editorState: (editor: LexicalEditor) => {
      const json = (initialJson ?? "").trim();
      if (json) {
        try {
          editor.setEditorState(editor.parseEditorState(json));
          return;
        } catch {
          // fall through to the plain-text seed
        }
      }
      const root = $getRoot();
      if (root.getFirstChild()) return;
      const text = (initialPlainText ?? "").trim();
      if (!text) {
        root.append($createParagraphNode());
        return;
      }
      for (const line of text.split("\n")) {
        const p = $createParagraphNode();
        if (line) p.append($createTextNode(line));
        root.append(p);
      }
    },
  }));

  const handleChange = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
      editorState.read(() => {
        onChange({
          json: JSON.stringify(editorState.toJSON()),
          html: $generateHtmlFromNodes(editor),
          text: $getRoot().getTextContent(),
        });
      });
    },
    [onChange],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <LexicalComposer initialConfig={initialConfig}>
        {!readOnly && <Toolbar variableSuggestions={variableSuggestions} />}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  "min-h-[180px] max-h-[380px] overflow-y-auto px-3.5 py-3 text-[13.5px] leading-relaxed text-ink focus:outline-none",
                  readOnly && "min-h-[80px] bg-surface-muted/30",
                )}
                aria-label="Şablon içeriği"
              />
            }
            placeholder={
              <div className="pointer-events-none absolute left-3.5 top-3 text-[13px] text-subtle">
                {readOnly ? "" : "Şablon metnini yazın…"}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      </LexicalComposer>
    </div>
  );
}
