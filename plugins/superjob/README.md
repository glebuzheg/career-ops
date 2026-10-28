# SuperJob

Opt-in provider for the official registered application API. Requires the
application Secret key (`X-Api-App-Id`), not an applicant account password.
Disabled by default; an explicit `provider: superjob` entry is required.
See [Russian setup](../../docs/RUSSIAN_SOURCES.md).

Search fields under `superjob:`: keyword, town, catalogues, experience,
type_of_work, payment_from, payment_to, no_agreement, period, order_field,
order_direction, client. Pages contain up to 100 records; `max_pages` defaults
to 3, maximum 20; health probes request one page. Network/API failures fail the
source; results are not reported as empty. Monthly compensation is annualized
for the scanner; missing employer names are `?`. No applications are sent.

This is an authenticated API integration for a personal fork. SuperJob's API
robots.txt disallows general crawling; it is not a zero-auth source proposed
for the upstream public registry. Use a registered application's authorized
API access and follow its terms.
