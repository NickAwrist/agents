/** Entry from GET /api/models */
export interface OllamaModelOption {
  name: string;
  size?: number;
  modified_at?: string;
  digest?: string;
}
