// Search tool namespace. Individual tools live in ./search/*; this barrel keeps
// the original import path and the `searchTools` registry array stable.
export {
  search_exa, get_content_exa, find_similar_exa, search_news,
  search_code, search_academic, search_by_domain, search_by_date,
} from "./search/exa-tools";
export { web_search, web_extract } from "./search/web-tools";
export { validate_url, extract_links, fetch_rss } from "./search/feed-tools";

import {
  search_exa, get_content_exa, find_similar_exa, search_news,
  search_code, search_academic, search_by_domain, search_by_date,
} from "./search/exa-tools";
import { web_search, web_extract } from "./search/web-tools";
import { validate_url, extract_links, fetch_rss } from "./search/feed-tools";

export const searchTools = [
  web_search, web_extract,
  search_exa, get_content_exa, find_similar_exa, search_news, search_code,
  search_academic, search_by_domain, search_by_date, validate_url,
  extract_links, fetch_rss,
];
