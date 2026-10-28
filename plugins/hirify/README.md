# Hirify MCP

Opt-in provider using your Hirify Streamable HTTP MCP endpoint. Set
`HIRIFY_MCP_URL` from the [account MCP/API page](https://hirify.me/account/mcp-api).
Set `HIRIFY_KEY` only if the configuration uses a Bearer key; a token already
embedded in the supplied URL remains secret in `.env`. Never commit either.

The client initializes a session, discovers tools (including paginated tool
lists), chooses a unique vacancy/job search tool and maps its input schema.
JSON and SSE responses are supported; sessions and protocol headers are kept.
An advertised `readOnlyHint: false` or a mutation-like name is rejected.
No full vacancy reads, contact reveals, applications or profile uploads run.

Set `hirify.query` on a `provider: hirify` portals entry. Optional `search_tool`,
`query_field` and `arguments` can live in that block or in plugin settings.
Use the actual server tool schema and filter guide to choose filters; this
plugin does not guess role/grade/location filter names. Required unknown
arguments fail before calling the tool. `page` and `per_page` are supplied only
when advertised. Default search budget is one page, maximum five, 20 cards/page.
The engine preserves probe page budgets for keyed providers too.

Tool results must carry structuredContent (or JSON text content) containing
`data: []`, `vacancies: []`, or an array of cards. Cards use title, company,
location/remote_type and url/href; slug-only cards use Hirify's observed public
`https://hirify.me/jobs/{slug}` route. The server's employer URL is preferred
when supplied. Missing employer identity is `?`, not a fabricated company.

This adapter is covered with protocol fixtures. **It has not been tested with
an authenticated live Hirify MCP account**: the endpoint/key were not available
in this session. Other transports, nested input schemas and non-JSON tool text
need an explicit adapter instead of being treated as empty search results.
See [Russian setup](../../docs/RUSSIAN_SOURCES.md).
