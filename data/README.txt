DATA AUTHORING AND REUSE

APPLICATION DATA PROJECTION (12 NOVEMBER 2026)
The app no longer includes toll costs, toll weights, toll scoring bounds
or toll-related explanatory text. tools\app-data.mjs removes those fields
while bundling JSON, before the standalone HTML is written; exported data
uses the same projected records. Scoring uses time, distance, scenery and
bend demand only. Source JSON, provider caches and historical route hashes
remain unchanged for reproducibility. Hashes refer to the original archived
records, before this application-only field projection.

Bundled snapshot: atlas.json
Source catalog: sources.json
North-to-south inclusion/exclusion/uncertainty audit: coverage-register.json
Original research inputs: research.mjs
Reviewed main-road anchor evidence: anchor-review.json
Full original OSRM responses and request URLs: cache/
License and source-data redistribution obligations: ..\DATA-LICENSE.txt

Regenerate current coverage metadata without network, preserving all routes:
  node tools\expand-beach-routes.mjs
prepare-routes.mjs is the historical baseline generator, not a complete
rebuild of this expanded atlas. Do not run it over the expanded atlas: its
original research.mjs inventory predates the 86-route preservation baseline.
The checked-in atlas plus beach-expansion.json and persistent cache are the
reproducible inputs for the current expansion.
Check catalog, geometry, citations, endpoints and cached metrics:
  node tools\validate-data.mjs
Focused tests (run by the parent integration task):
  node --test tests\data.test.mjs

The public provider was used for one finite curated authoring run, serialized
at >=1.25 seconds between requests with an identifying User-Agent. Its current
usage policy was inspected before use. Cached responses include initial
anchor-research requests as well as the final itineraries. Regeneration is
cache-only by default; --fetch explicitly opts into missing requests.

For separately reviewed future routing research, use a controlled OSRM
instance with the appropriate regional OSM extract and car profile:
  $env:OSRM_BASE_URL = 'http://localhost:5000'
  node tools\expand-beach-routes.mjs --fetch
A provider/profile change creates a distinct request cache; never mix metrics
from one provider with geometry from another. Frozen snaps and prefix
comparisons must still pass; changing a graph does not authorize replacing
the preserved itineraries or their endpoints.

No source claims to certify today's opening or legal access. Retrieval time,
research cutoff and field/live verification are distinct: verifiedAt is null.
Tourism and historical documents establish identities/corridors, while the
car graph provides road geometry and model estimates. Neither substitutes
for current official restrictions or an on-the-ground survey.

The enumerated confirmed documented-road baseline now covers 19 corridors,
including the northern Trimbak-Jawhar Amboli identity, Pargad-Mirvel,
and the Anashi-Kadra approach to south Goa. Every confirmed baseline
corridor has a cached car-road itinerary. This is not universal discovery.

Raghuvir and all twelve of its itineraries were removed on 11 November 2026
at the owner's request. Beach shortlists and normalization bounds were
recomputed over the remaining corridors. One additional Malshej-Harihareshwar
itinerary was audited to resolve the new fifth-ghat ranking boundary.
Historic cache responses and the earlier expansion plan remain unchanged
as authoring evidence; they are not included as active app routes.
A direct Namkhol-spur descent remains a separately blocked link claim.

Official descriptions and constrained car-network bypass audits support
excluding the historic Naneghat trek and Madhe waterfall descent from the
motor-through-road baseline. Radtondi/Fitzgerald is a documented Ambenali
alias. Historic foot/pack passes are distinguished from modern approach
roads; the Mangeli border-road completion/through-access claim remains
specifically unconfirmed. See the register and candidate-road-audit.json.

The legacy ghat lengthKm fields are selected-anchor road intervals, NOT
independently established actual whole-ghat lengths. Surveyed road
elevations and toll amounts remain unknown; supplementary SRTM terrain
estimates are documented below. Difficulty is an editorial curves-only driving
demand proxy: full source geometry sampled every100m, with direction changes
of >=35 degrees counted per10km. Bands <10/<20/<30/<40/>=40 yield1/2/3/4/5.
Raw statistics and the exact rubric are retained and independently recomputed
by the validator. It does NOT assess width, surface, grade, weather or safety.
Scenery is a sourced editorial corridor preference, not a whole-trip measure.
Beach coordinates are road-arrival references, not promises of parking.

TEN BEACHES PER GHAT / FIVE PRIMARY GHATS PER BEACH (11 NOVEMBER 2026)

The baseline expansion snapshot has 19 canonical ghats, 38 distinct beaches
and 303 routes. The current active atlas additionally applies the Bor
alignment supplement described below.
The 82 original itineraries for supported ghats retain their exact IDs,
geometry, metrics and provenance; hashes
are recorded in methodology.nearestBeaches.retainedRoutes. The common Pune
origin and all 22 earlier beach road endpoints are unchanged.

Sixteen added destinations are evidenced by primary government tourism,
district/divisional and Maritime Board sources in beach-expansion.json:
Nagaon, Akshi, Revdanda, Korlai, Kelshi, Harnai, Ladghar, Bhatye, Devgad,
Kunkeshwar, Querim/Keri, Mandrem, Morjim, Candolim, Benaulim and Varca.
Aliases are not additional beaches: Querim and Keri are one destination,
Kelshi and Kelashi are one destination. Existing Murud is Murud-Janjira in
Raigad, not Murud near Dapoli. Editorial near-access seeds are snapped once
by the cached car table; those returned road arrivals are then frozen.
These are not sand-driving, parking, swimming-safety or legal-access claims.

Each ghat exposes nearestBeachIds (ten distinct beaches) and
closestBeachRoutes (beachId, routeId, distanceM, comparisonDistanceM).
Each beach exposes shortestGhatIds (five distinct requested main corridors)
and closestGhatRoutes (ghatId, routeId, distanceM, comparisonDistanceM).
Both lists sort actual full-trip metres, breaking ties by beach/ghat ID.
Each new route has explicit primaryGhatId. For preserved older routes the
main ghat follows the longest matching route-ID prefix. Highway variants
are not an additional ghat.
adjacencyGraph.routeEdges explicitly records ghatId (requested main ghat),
beachId, routeId, distanceM and traversedGhatIds for every ghat itinerary;
highway variants are excluded and approach ghats are annotations only.

The original numeric OSRM table compares 20 frozen exits with 38 arrivals.
The active comparisons now use 19 source rows (722 cells), each adding its
fixed Pune-through-ghat prefix distance. Explicit tableSourceIndex values
preserve the source-row mapping without modifying the provider response.
The following request totals describe the original expansion run. The
initial union contains 296 pairs; 213 lacked an existing itinerary.
Complete directed-leg reuse reduced its initial request estimate to 106
(85 original-beach itineraries and 21 shared coastal connectors). Mainland
bridge reroutes and ranking-boundary audits used 117 geometry requests in
total; the removal's boundary check added one, for 118 geometry requests
overall, below the finite 150-request cap. One original boundary round audited 15
additional pairs. The initial plan is coverage-expansion-plan.json.

The original expansion added 228 routes: 87 full provider itineraries and
141 compositions, before the removal described above.
Compositions concatenate only complete, unmodified, forward OSRM legs,
joining at identical car-road nodes; distances and times are exact sums of
those source-leg totals. An earlier coastal arrival is an explicit routing
stop, not an invented road join. No leg is reversed, no distance is inferred
from straight lines, and no global whole-trip optimum is asserted.
cache/composed-*.json files are lightweight derivation manifests, not fake
provider responses. Each names its source cacheFile, legIndex and
reversed:false. loadRouteRecord in prepare-routes.mjs materializes the
actual full geometry and steps from those immutable provider responses.
All source responses remain persistent and separate from the browser data.
The validator recomputes these joins, route totals and ghat-demand samples.

Every route retains ordered provenance.waypointPositions and ghatSections.
Section anchor fields are entryPlaceId, interiorPlaceId and exitPlaceId;
other section fields are ghatId, distanceM and roadDemand. Maximum
intermediate waypoints (waypointIds.length - 2) is seven; no route exceeds
Google Maps' nine-intermediate-waypoint desktop limit. All critical ordered
ghat anchors and mainland-junction constraints therefore fit without loss.

OSRM returns model-preferred driving paths, not a pure minimum-distance
search. Provider exclude=ferry was not supported; table costs therefore
remain provisional until the selected full-response ferry audit. Final
ordering uses actual full-itinerary metres. No unevaluated numeric candidate
is shorter than the actual tenth beach or fifth distinct ghat selection.
An evaluated candidate's actual constrained route, not its provisional
table cost, resolves its boundary. Thus a table cell may be numerically
shorter but its audited mainland/stop-constrained itinerary longer.
No omitted audited itinerary is shorter. These checks are validated, but
do not establish exhaustive global road-route optimization or live access.

Original description-source research cutoff remains 10 November 2026.
New-beach identity research and coverage expansion are dated 11 November
2026, the latest bundled atlas/register researchDate. Every underlying
response retains its actual retrieval timestamp;
composition manifests state the assembly date rather than inventing a
whole-trip provider retrieval. No old descriptive source was reverified.
The generator is cache-only unless --fetch is explicitly supplied, limits
this expansion to 150 geometry requests across restarts, serializes requests
at >=1.25 seconds, and stops on provider errors without retry storms.
--table-only inspects the numeric comparison/selected-union plan.

SOURCED JOURNEY STAGES AND GHAT FIELD GUIDE (11 NOVEMBER 2026)

data/field-guide.json supplements, rather than modifies, the 303 immutable
route records. The three stage totals group complete cached OSRM legs:
Pune to chosen road marker A, A to B, and B to beach road arrival.
The markers are not verified ghat entrances/exits. A-B may include approach
roads or omit part of the pass; further mountain descent may occur after B.
Each stage exposes metres and model seconds. Source-leg evidence, cache
references, actual retrieval dates and exact reconciliation are retained.

data/ghat-stories.json is the manually reviewed claim-level input. Each
published assertion has source IDs, a locator and an evidence kind.
Recorded traditions are not presented as established events. A nearby
fort is explicitly distinguished from documented pass defence. Unknown
name origins, legends and guard-fort roles are left unsupported, not
filled from wordplay or unsourced travel blogs.

All 19 ghats have profiles based on NASA/USGS SRTMGL1 v003 through Open
Topo Data srtm30m. These are approximately 30 m terrain-raster estimates,
not surveyed road heights. Original radar acquisition was February 2000.
Each profile samples ordered retained raw road vertices at approximately
500 m intervals, including the chosen endpoint and interior markers. The
profiles are not certified complete-ghat profiles or pass altitudes. The distance axis
scales cumulative geodesic road geometry to audited OSRM section metres.
Every elevation has a response index, source coordinates and original
response value. No hill-station altitude is substituted for a crossing.
Full responses are in field-guide-cache/ and embedded in the HTML's
downloadable profile evidence. No elevation requests occur at runtime.

Regenerate from persistent caches after changing reviewed story inputs:
  node tools\prepare-field-guide.mjs
--fetch explicitly permits missing elevation requests, serialized at
>=1.25 seconds, with at most 100 sample locations per ghat request.
The initial finite run used 19 requests and stops on provider errors.
The build checks both the core atlas and this supplementary evidence;
tests\field-guide.test.mjs verifies stage sums and source-level integrity.

GHAT LENGTH AND THREE-PRODUCT TERRAIN AUDIT (11 NOVEMBER 2026)

ghat-length-sources.json records the manually reviewed reference scopes.
ghat-measurement-audit.json distinguishes published approximate ghat-only
lengths from historical alignments, project portions and chosen-marker
distances. Current exact full-ghat boundaries remain unestablished; no
historical, railway, town-to-town or project figure is silently substituted.
The 2019 NDMA inventory's approximate Malshej, Varandh and Karul ghat-only
figures are references, not proofs that the model markers delimit them.
Direct-document versus indexed-text review limitations are recorded.

All 724 sample coordinates are compared separately against SRTM30m,
ASTER GDEM v3 (approximately 30 m, NASA/METI via Open Topo Data) and
Copernicus DEM GLO-90 (90 m, Copernicus programme / ESA via Open-Meteo).
They are three distinct terrain products, not three road surveys; SRTM and
ASTER share an API service. Different age, grid and vertical references
mean disagreement is not an error bar and agreement does not prove a
road-deck height or a true ghat boundary. Values are not averaged.
The 38 additional successful provider responses are retained under
measurement-audit-cache/ and embedded in downloadable comparison evidence.

Bor has materially different route-variant intervals; Pargad's chosen
interval stays on the plateau. Those intervals must not be presented as
independently established full-ghat lengths or coastward descents.
Source-level integrity checks alone do not validate geographic pass limits.

Regenerate the audit without network after editing reviewed references:
  node tools\audit-ghat-measurements.mjs
--fetch explicitly permits only missing cached terrain requests. The script
stops on provider errors without retry storms and paces Open-Meteo separately.
The first run stopped at HTTP 429; a later run respected the stated cooldown
and reused every successful cache. There are no runtime elevation requests.
The build now validates the measurement audit and its separate source caches.
Focused regressions: tests\measurements.test.mjs.

THREE BOR ROAD ALIGNMENTS (11 NOVEMBER 2026)

bor-road-options.json adds two separately routed westbound expressway
prefixes: with the Missing Link, and without it through the original
Khandala expressway alignment. The existing twenty Bor NH48 itineraries
remain the old-highway option. OSM motorway/tunnel way geometry is retained
in bor-route-cache/ and checked against the actual routed prefix vertices.
The Missing Link prefix must traverse both named tunnels; the original
expressway prefix must not contain Missing Link steps.

Forty additional expressway itineraries reuse complete, forward-only
coastal legs at an identical Khopoli road junction. Only two new OSRM
geometry requests were made, bringing the finite geometry total to 120,
within the earlier 150-request ceiling. No advertised saving, invented
tunnel geometry, interpolated road-deck height or estimated connector
length is inserted. Shared-junction constraints mean these are not claimed
as globally optimized whole-trip paths. Model times exclude live traffic.

The three earlier highway-labelled records actually followed NH48 and
local detours. They remain unchanged in atlas.json and appear as
retiredRoutes in the exported active atlas, not as expressway choices.
The active app has 340 routes (303 - 3 retired + 40 new). Original source
records and their historical hashes remain available; active retained
hashes and scoring normalization bounds are recalculated by the overlay.
The new routes do not beat their old-highway counterparts in distance,
so the earlier all-beach shortest-distance boundary audit remains valid.
This condition is checked rather than assumed.

Bor displays ten beaches with all three road options, or one alignment
at a time. A beach still preselects five distinct ghats; if Bor qualifies,
its other two road options are offered without silently preselecting seven
routes or treating the alignments as extra ghats. Reset restores All three.

Only Old NH48 has the previous terrain chart. Both expressway choices
withhold a road-deck profile: the surface DEM is not tunnel elevation.
Expressway scenery and toll amounts remain independently unrated/unknown,
rather than inheriting the old ghat's scenery rating.

Regenerate without network:
  node tools\prepare-bor-alignments.mjs
--fetch explicitly permits missing requests only, with a two-prefix routing
request cap. A failed broad Overpass query was narrowed to the junction;
no repeated identical request or synthetic fallback was used.
The build checks both base data and the active merged atlas, complete
cached geometry, direction, tunnel identity, stage sums and Google links.
Focused regressions: tests\bor-alignments.test.mjs and
tests\bor-alignments.browser.spec.mjs.
