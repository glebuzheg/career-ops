// Opt-in Hirify vacancy search over MCP. Never invokes full reads, contact
// reveal or applications (separate metered operations). No assumed REST paths.
import { connectHirify } from './_mcp.mjs';
import { htmlToText } from '../../providers/_html-to-text.mjs';
import { pageBudget, text } from '../../providers/_ru-board.mjs';
import { sleep } from '../../providers/_http.mjs';
import { safeEncodeURIComponent } from '../../providers/_safe-url.mjs';

function searchTool(tool) {
  return typeof tool?.name === 'string' && /search/i.test(tool.name) && /vacanc|jobs?/i.test(tool.name)
    && !/apply|submit|reveal|create|delete|update|send/i.test(tool.name) && tool.annotations?.readOnlyHint !== false;
}

export function hirifyJobs(result) {
  if (result?.isError) throw new Error('hirify: vacancy search tool failed; check access and search arguments');
  let data = result?.structuredContent;
  if (!data && Array.isArray(result?.content)) {
    const body = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    try { data = JSON.parse(body); } catch { throw new Error('hirify: search tool must return JSON vacancy data'); }
  }
  const rows = Array.isArray(data) ? data : data?.data ?? data?.vacancies;
  if (!Array.isArray(rows) || data?.error || data?.ok === false) throw new Error('hirify: unexpected vacancy envelope, expected data[] or vacancies[]');
  const jobs = [];
  for (const row of rows) {
    if (!row || row.archived || !text(row.title)) continue;
    let url;
    try {
      // Hirify CLI search cards expose slug; the public site links /jobs/{slug}
      // (measured 2026-10-28). Prefer an explicit source link when supplied.
      const slug = text(row.slug) ? safeEncodeURIComponent(row.slug) : null;
      const u = new URL(row.url || row.href || (slug ? `https://hirify.me/jobs/${slug}` : ''));
      if (u.protocol !== 'https:' || u.username || u.password) continue;
      url = u.href;
    } catch { continue; }
    const location = [text(row.location), /^(remote|fully_remote)$/i.test(row.remote_type) ? 'Remote' : ''].filter(Boolean).join('; ');
    const job = { title: htmlToText(row.title), url, company: text(row.company) || text(row.company?.name) || '?', location };
    if (text(row.description)) job.description = htmlToText(row.description);
    if (job.title) jobs.push(job);
  }
  return { jobs, rawCount: rows.length, meta: data?.meta ?? {} };
}

export default {
  provider: {
    id: 'hirify',
    fetch: async (entry, ctx) => {
      const config = { ...ctx.settings, ...entry.hirify };
      const query = text(config.query);
      if (!query) throw new Error('hirify: set hirify.query to a focused vacancy search');
      const limit = pageBudget(entry, ctx, 1, 5);
      const { request } = await connectHirify(ctx);
      const tools = [];
      let cursor;
      for (let page = 0; page < 5; page++) {
        const result = await request('tools/list', cursor ? { cursor } : {});
        if (!Array.isArray(result?.tools)) throw new Error('hirify: invalid MCP tool list');
        tools.push(...result.tools);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      if (cursor) throw new Error('hirify: MCP tool discovery exceeded page budget');
      const choices = tools.filter(t => searchTool(t) && (!config.search_tool || t.name === config.search_tool));
      if (choices.length !== 1) throw new Error('hirify: select a unique read-only vacancy search tool with search_tool');
      const tool = choices[0], schema = tool.inputSchema;
      if (!schema || schema.type !== 'object') throw new Error('hirify: search tool has an unsupported input schema');
      const properties = schema.properties || {};
      const field = config.query_field || ['search', 'query', 'q'].find(k => properties[k]?.type === 'string');
      if (!field || !Object.hasOwn(properties, field)) throw new Error('hirify: configure query_field from the server search tool schema');
      const args = config.arguments ?? {};
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('hirify: arguments must be an object from the tool schema');
      const base = { ...args, [field]: query };
      for (const key of schema.required ?? []) if (!Object.hasOwn(base, key) && !['page', 'per_page'].includes(key)) throw new Error(`hirify: missing search argument ${key}`);
      for (const key of Object.keys(base)) if (!Object.hasOwn(properties, key) && schema.additionalProperties === false) throw new Error(`hirify: unsupported search argument ${key}`);
      const jobs = [], seen = new Set();
      for (let page = 1; page <= limit; page++) {
        if (page > 1) await sleep(500, ctx);
        const args = { ...base };
        if (Object.hasOwn(properties, 'page')) args.page = page;
        if (Object.hasOwn(properties, 'per_page')) args.per_page = 20;
        const parsed = hirifyJobs(await request('tools/call', { name: tool.name, arguments: args }));
        let added = 0;
        for (const job of parsed.jobs) if (!seen.has(job.url)) { seen.add(job.url); jobs.push(job); added++; }
        const lastPage = parsed.meta.last_page ?? parsed.meta.total_pages;
        if (!parsed.rawCount || (Number.isInteger(lastPage) && page >= lastPage) || parsed.meta.has_more === false) break;
        if (!Object.hasOwn(properties, 'page')) break;
        if (page > 1 && !added) { ctx.log?.('hirify: repeated search page; results incomplete'); break; }
        if (page === limit && ctx.maxPages === undefined) ctx.log?.(`hirify: search capped at ${limit} page(s); refine the query for more relevant results`);
      }
      return jobs;
    },
  },
};
