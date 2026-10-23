# Subdivision display names

`subdivisions.json` is derived from Unicode CLDR, revision `96e54b273d2da4ec6fbad350ba19ff23fa24a588`:

- https://github.com/unicode-org/cldr/blob/96e54b273d2da4ec6fbad350ba19ff23fa24a588/common/subdivisions/en.xml
- https://github.com/unicode-org/cldr/blob/96e54b273d2da4ec6fbad350ba19ff23fa24a588/common/subdivisions/zh.xml

Keys retain CLDR subdivision identifiers. Each value is `[English, Chinese]`; alternate entries and inheritance markers are omitted. Missing translations remain empty for runtime fallback. This is a display dictionary, not an IP geolocation database. Original event identities and counts are unchanged.

CLDR's `zh` source includes some Traditional Chinese names. Chinese display labels and alias matching are normalized to Simplified Chinese at runtime using `opencc-js@1.4.2` (`t` → `cn`, traditional-to-simplified entry point). The same conversion covers provider-supplied and historical names that do not match this dictionary. The source data, stored event keys and English labels are preserved.

Copyright Unicode, Inc. Distributed under Unicode License v3; see `LICENSE-UNICODE.txt`.
