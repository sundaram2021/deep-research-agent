export function IconDatabase({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  );
}

export function IconText({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function IconFile({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

const TOOL_ICON_MAP: Record<string, string> = {
  exa_search: "search",
  exa_search_with_content: "search",
  exa_find_similar: "search",
  exa_get_contents: "search",
  web_search: "search",
  search_wikipedia: "search",
  search_arxiv: "search",
  search_github: "search",
  search_news: "search",
  get_exa_answer: "brain",
  get_code_context_exa: "file",
  csv_to_json: "database",
  json_to_csv: "database",
  calculate_stats: "database",
  filter_data: "database",
  sort_data: "database",
  group_by: "database",
  count_words: "text",
  extract_keywords: "text",
  summarize_text: "text",
  detect_language: "text",
  count_tokens: "text",
  truncate_text: "text",
  convert_case: "text",
  slugify: "text",
  extract_emails: "text",
  extract_urls: "text",
  clean_whitespace: "text",
  generate_markdown: "file",
  generate_table: "file",
  generate_report: "file",
  create_todo_list: "brain",
  list_workspaces: "database",
  list_files: "file",
  list_artifacts: "file",
  read_file: "file",
  write_file: "file",
  read_image: "file",
  read_audio: "file",
  read_video: "file",
};

export function getToolIcon(name: string | undefined): string {
  if (!name) return "wrench";
  const key = name.toLowerCase();
  return TOOL_ICON_MAP[key] ?? "wrench";
}
