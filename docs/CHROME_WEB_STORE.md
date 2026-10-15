# Chrome Web Store publication checklist

## Build and review

1. Merge a reviewed pull request after GitHub Actions passes.
2. Download the `chrome-web-store-extension` artifact from the successful workflow run.
3. Upload the ZIP inside the Chrome Web Store Developer Dashboard.
4. Fill in listing language, screenshots, icon, category, and support contact.
5. Fill in the privacy practices and host-permission justifications accurately.
6. Submit for Google's review. This repository does not auto-publish or require store API credentials.

## Single purpose / permission descriptions

- Purpose: allow the user to inspect Lanhu and Axure design pages through a *local* MCP bridge, on explicit opt-in.
- `storage`: remembers the local bridge port and whether the user enabled data collection.
- `scripting`: injects the fetch/XHR observer into the Lanhu page to access design metadata.
- `webNavigation`: locates Axure iframe contexts so the correct prototype can be parsed.
- `https://*.lanhuapp.com/*` and `https://*.lanhu.com/*`: confines the extension to Lanhu documents.
- The extension communicates with the user's own local machine on `ws://127.0.0.1:3100` (configurable port).

## Privacy disclosures

Data types potentially handled: project and document names, mockups and layer text, comments, metadata and design URLs. The bridge can expose them to an MCP client running on the user's computer. This extension does not operate a vendor-owned backend, but **the selected MCP client may transmit content to its AI service**. Never promise that all data stays local if a cloud AI client is connected. Avoid exposing passwords, tokens, or confidential documents without authorization.

The published listing should link to a current public privacy policy under the publisher's control and should contain screenshots of the opt-in toggle. Review all Chrome Web Store User Data Policy requirements independently before submission.

## Current limitations

No Web Store API upload is configured; publishing and approval require the developer's account and Google review. The loopback-only bridge does not implement origin validation or a token per the project owner's chosen security policy. Local webpages may still attempt loopback connections; operate only in a trusted local browser environment.
