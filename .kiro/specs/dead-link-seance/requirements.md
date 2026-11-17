# Requirements Document

## Introduction

Dead Link Séance is a Halloween-themed web app for the Kiroween hackathon (Resurrection category). A Visitor pastes a dead web link; the app finds the most recent saved copy in the Internet Archive Wayback Machine, extracts the readable text, and an AI "medium" brings the page back as a clean modern page with a short, in-character summary and a guess at why the page died.

The first version is intentionally small: a ouija-board home page, two server-side API routes (Wayback lookup + extraction, and the AI medium), and a results page. No database, no backend state, no auth. Built with Next.js (App Router) + TypeScript on Vercel.

## Glossary

- **App**: The Dead Link Séance Next.js application as a whole.
- **Visitor**: The end user who pastes a dead link and reads the results. No account, anonymous.
- **Home_Page**: The landing route where the Visitor pastes a link and clicks Summon.
- **Ouija_Input**: The text field on the Home_Page styled like a ouija board where the Visitor pastes a URL.
- **Summon_Button**: The button on the Home_Page that submits the Ouija_Input URL.
- **Example_Dead_Links**: Three pre-filled dead links shown on the Home_Page, each known to resolve to a real Wayback Machine snapshot.
- **Wayback_Machine**: The Internet Archive's archived-web snapshot service at archive.org.
- **Snapshot**: A single archived copy of a web page returned by the Wayback_Machine, identified by a timestamp and an archive URL.
- **Timestamp_Hint**: An optional 8-digit YYYYMMDD string the Visitor or an Example_Dead_Link supplies to bias Snapshot selection toward a date when the page was still alive.
- **Wayback_Lookup_Route**: The server-side Next.js Route Handler (under `app/api/**`) that queries Wayback availability, fetches the raw snapshot, and extracts the title and readable text.
- **Snapshot_Extractor_Route**: The extraction step within the Wayback_Lookup_Route that runs fetched HTML through Readability to produce Readable_Text.
- **Readable_Text**: The cleaned article text and title extracted from a snapshot's HTML using `@mozilla/readability` with `jsdom`.
- **Medium_Route**: The server-side Next.js Route Handler (under `app/api/**`) that sends Readable_Text to an OpenAI-compatible Chat Completions API and returns the Summary and Cause_of_Death.
- **Summary**: A three-sentence summary of the restored page written in the voice of a friendly ghost.
- **Cause_of_Death**: A short in-theme guess at why the page died (e.g., domain expired, site moved).
- **Results_Page**: The route that displays the restored Readable_Text, Snapshot date, archive link, and (when available) the Summary and Cause_of_Death.
- **Archive_Copy_Link**: A hyperlink to the original Wayback_Machine copy of the Snapshot.

## Requirements

### Requirement 1: Home Page with Ouija Board Input

**User Story:** As a Visitor, I want a home page styled like a ouija board where I can paste a dead link and summon its past, so that I can resurrect a lost web page.

#### Acceptance Criteria

1. THE Home_Page SHALL display an Ouija_Input, accepting a URL up to a maximum of 2048 characters, where the Visitor can paste a URL, and a Summon_Button that submits the URL.
2. THE Home_Page SHALL use a dark background with candle-glow accents and a séance/ouija theme while maintaining a minimum text-to-background contrast ratio of 4.5:1 for body text.
3. THE Home_Page SHALL display three Example_Dead_Links, each pointing to a URL for which an existing Internet Archive Wayback Machine snapshot is available.
4. WHEN a Visitor selects an Example_Dead_Link, THE Home_Page SHALL populate the Ouija_Input with that link's URL.
5. WHILE the viewport width is 768 pixels or less, THE Home_Page SHALL render the Ouija_Input and Summon_Button within the viewport width without horizontal scrolling and with a Summon_Button touch target of at least 44 by 44 pixels.
6. IF the Visitor activates the Summon_Button while the Ouija_Input is empty or contains a value that is not a valid URL, THEN THE Home_Page SHALL display an in-theme error message indicating the input is invalid and SHALL NOT submit the request.

### Requirement 2: Wayback Availability Lookup

**User Story:** As a Visitor, I want the app to find the closest saved copy of my dead link in the Wayback Machine, so that the page can be restored.

#### Acceptance Criteria

1. WHEN the Visitor submits a URL via the Summon_Button, THE Wayback_Lookup_Route SHALL query the Wayback availability endpoint `https://archive.org/wayback/available?url=<url>` server-side.
2. WHEN the Wayback availability endpoint returns one or more Snapshots, THE Wayback_Lookup_Route SHALL return the Snapshot closest to a provided Timestamp_Hint, or the Snapshot with the latest timestamp when no Timestamp_Hint is provided, in each case including the Snapshot timestamp and archive URL as the lookup result.
3. IF the submitted value cannot be parsed as an absolute URL with an http or https scheme, THEN THE Wayback_Lookup_Route SHALL return an in-theme error indicating the link is not valid.
4. IF the Wayback availability endpoint returns no Snapshots for the submitted URL, THEN THE Wayback_Lookup_Route SHALL return an in-theme error such as "The spirits could not find this page."
5. IF the Wayback availability lookup exceeds 20 seconds, THEN THE Wayback_Lookup_Route SHALL time out and return an in-theme error such as "The archive is too slow."
6. THE Wayback_Lookup_Route SHALL perform all archive.org network calls server-side in a Next.js Route Handler under `app/api/**` and never from the browser.
7. WHERE a Timestamp_Hint is provided, THE Wayback_Lookup_Route SHALL pass the Timestamp_Hint, an 8-digit YYYYMMDD string, to the Wayback availability endpoint as the `timestamp` query parameter.

### Requirement 3: Fetch and Extract Snapshot Content

**User Story:** As a Visitor, I want the saved copy fetched and its readable text extracted, so that I can read the restored page.

#### Acceptance Criteria

1. WHEN a Snapshot is found, THE Snapshot_Extractor_Route SHALL fetch the raw snapshot using `https://web.archive.org/web/<timestamp>id_/<url>` server-side.
2. WHEN the raw snapshot fetch succeeds, THE Snapshot_Extractor_Route SHALL extract the page title and Readable_Text from the fetched HTML using `@mozilla/readability` with `jsdom`.
3. IF the snapshot fetch exceeds 20 seconds, THEN THE Snapshot_Extractor_Route SHALL time out and return an in-theme error message indicating the archive responded too slowly.
4. IF the snapshot fetch fails, `jsdom` cannot parse the fetched HTML, or `@mozilla/readability` yields no Readable_Text, THEN THE Snapshot_Extractor_Route SHALL return an in-theme error message indicating the page could not be restored and SHALL not crash.

### Requirement 4: AI Medium Summary and Cause of Death

**User Story:** As a Visitor, I want a friendly ghost to summarize the page and guess why it died, so that the séance feels memorable.

#### Acceptance Criteria

1. WHEN Readable_Text is available and AI_API_KEY is set, THE Medium_Route SHALL send the text to an OpenAI-compatible Chat Completions API configured by AI_BASE_URL, AI_API_KEY, and AI_MODEL, server-side.
2. THE Medium_Route SHALL send a system message that sets the séance persona and requests a three-sentence Summary and a Cause_of_Death.
3. THE Medium_Route SHALL return a three-sentence Summary written as a friendly ghost and a Cause_of_Death of at most one sentence.
4. WHERE AI_API_KEY is not set, THE App SHALL skip the Summary and Cause_of_Death and SHALL still show the restored Readable_Text.
5. THE App SHALL keep API keys in the environment variables AI_BASE_URL, AI_API_KEY, and AI_MODEL, SHALL keep `.env` gitignored, and SHALL not hard-code keys in source.
6. IF the AI request fails or exceeds 20 seconds, THEN THE App SHALL still show the restored Readable_Text without a Summary or Cause_of_Death and SHALL not expose a raw error to the Visitor.

### Requirement 5: Results Page

**User Story:** As a Visitor, I want a results page that shows the summary, restored text, snapshot date, and a link to the original archive copy, so that I can read and explore the resurrected page.

#### Acceptance Criteria

1. WHEN restoration succeeds, THE Results_Page SHALL display the page title and display the Readable_Text as readable text with no raw HTML markup visible to the user.
2. WHILE the Results_Page is displayed, THE Results_Page SHALL display the Snapshot date of the restored copy.
3. WHILE the Results_Page is displayed, THE Results_Page SHALL display an Archive_Copy_Link to the original Wayback_Machine copy.
4. IF a non-empty Summary and a non-empty Cause_of_Death are available for the restored page, THEN THE Results_Page SHALL display them above the restored Readable_Text.
5. WHERE AI_API_KEY is not set, THE Results_Page SHALL display the restored Readable_Text without the Summary and Cause_of_Death.
6. WHILE the viewport width is 640 pixels or less, THE Results_Page SHALL display all of its content without requiring horizontal scrolling, with text wrapping to fit within the viewport width.
7. IF the AI_API returns an error or produces an empty Summary or Cause_of_Death, THEN THE Results_Page SHALL display the restored Readable_Text without the Summary and Cause_of_Death.

### Requirement 6: In-Theme Error Handling

**User Story:** As a Visitor, I want clear, in-theme messages when something goes wrong, so that errors feel part of the experience rather than technical failures.

#### Acceptance Criteria

1. IF the submitted value is empty or is not a well-formed HTTP or HTTPS URL, THEN THE App SHALL show an in-theme message such as "That is not a valid link."
2. IF a Wayback_Machine availability lookup returns no Snapshot, THEN THE App SHALL show an in-theme message such as "The spirits could not find this page."
3. IF an archive lookup or fetch times out after 20 seconds, THEN THE App SHALL show an in-theme message such as "The archive is too slow."
4. IF a Wayback_Machine lookup or fetch fails for any reason other than a missing Snapshot or a timeout, THEN THE App SHALL show an in-theme message indicating the archive could not be reached.
5. WHEN THE App displays an error to a Visitor, THE App SHALL display it as an in-theme message that is consistent with the séance/ouija theme and contains no raw technical details such as stack traces, exception messages, HTTP status codes, or library or network error text.

### Requirement 7: Architecture and Stack Constraints

**User Story:** As a developer, I want the app built on a simple, server-side Next.js stack, so that it deploys easily and stays maintainable.

#### Acceptance Criteria

1. THE App SHALL be a Next.js App Router project written in TypeScript, and SHALL build without errors and deploy to Vercel without requiring a custom server process.
2. THE App SHALL be stateless: it SHALL fetch all data per request from the Wayback_Machine and the OpenAI-compatible Chat Completions API, with no database, no persistent backend state, and no authentication.
3. THE App SHALL perform all archive.org and OpenAI-compatible Chat Completions API network calls server-side in Next.js Route Handlers under `app/api/**`, and SHALL not perform such calls from the browser.

### Requirement 8: Project Documentation

**User Story:** As a developer, I want a short README explaining how to run the app and how Kiro was used, so that I can set it up and understand its provenance.

#### Acceptance Criteria

1. THE repository SHALL include a README.md that documents installation steps and states the dev and build commands.
2. THE README.md SHALL describe the purpose and the required-or-optional status of each of the AI_BASE_URL, AI_API_KEY, and AI_MODEL environment variables.
3. THE README.md SHALL describe how Kiro was used to build the App, identifying the Kiro steering and spec-driven workflow that guided development.
