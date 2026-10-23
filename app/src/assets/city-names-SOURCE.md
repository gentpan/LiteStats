# City display names

`city-names.json` contains compressed, country-scoped display records derived from
GeoNames public downloads retrieved 2026-10-23, including cities500, populated
places and administrative districts with Chinese alternate names. It is a name
dictionary, not an IP location database and contains no analytics export.

Source: https://download.geonames.org/export/dump/
Field definitions: https://download.geonames.org/export/dump/readme.txt
Attribution: GeoNames, https://www.geonames.org/
License: Creative Commons Attribution 4.0 International,
https://creativecommons.org/licenses/by/4.0/

Modified by LiteStats: selected non-historic/non-colloquial Chinese alternate
names, preferred zh-CN/zh-Hans then zh, converted Traditional to Simplified with
OpenCC, normalized Latin aliases, mapped administrative names to CLDR ISO codes,
and gzip/base64 packed by country. Records are indexed lazily on the server;
the dictionary is not included in browser assets. It does not rewrite stored
names or merge visitor counts. Ambiguous names without a reliable match use an
explicit Chinese placeholder. Country/province boundaries take precedence;
a clearly dominant population center can disambiguate same-province villages.

Reproduce from public downloads only (outside the repository):

```sh
python3 scripts/extract-city-names.py /path/to/public-geonames-downloads
bun scripts/prepare-city-names.ts /path/to/public-geonames-downloads/localized-cities-source.json
```

Source archive SHA-256:

- allCountries.zip: `5f939a816e33115b2a2cc97eb94a037af2542eafb9882cf37390a38ac414ec7a`
- cities500.zip: `8c9b0ad3de5a80493b48344d964972685405380cd2ae2206dc70fce2bf52ac9e`
- alternateNamesV2.zip: `ec9c061b1b471b819c7d52ad70102418bcba321b24283f54272b5f06463b315c`
- admin1CodesASCII.txt: `55153d45d5347e658eed69c1064563e929c6e199d51ed0649a61d2e629711d44`

Names and translations inherit source limitations; English report labels continue
to use original event names. The raw grouping key is preserved for filters.
