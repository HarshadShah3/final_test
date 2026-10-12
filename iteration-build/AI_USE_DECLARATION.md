# Generative AI Use Declaration

## Declaration

AI-assisted development tools used by team members supported the frontend and backend development of this prototype. Assistance covered UI alternatives, React component structure, API design suggestions, debugging, test ideas and documentation drafting. Team members reviewed, modified and tested the accepted output before committing it.

AI-generated text or values are not treated as real project data. Regional indicators come from the team-supplied datasets recorded in `backend/data-sources/`; map geometry and image sources are documented separately. The team remains responsible for correctness, licensing, academic integrity and the submitted code.

## Representative prompt register

These are concise summaries of the development questions; they are not presented as a verbatim export of every conversation.

| Area | Question asked of AI | Human verification |
| --- | --- | --- |
| Frontend structure | How should a React flow connect Landing, Preferences, Explore and Profile pages while keeping preferences in memory only? | Route and refresh behaviour checked locally |
| Explore map | How can GeoJSON LGA polygons be projected into an accessible SVG map with colour-only recommendation highlighting? | 56 map features and keyboard/click selection tested |
| Backend contract | How should Express validate location, one to three priorities, filters and result limits? | Invalid and valid payloads covered by automated tests |
| Recommendation logic | How can priority scores and geographic proximity be combined transparently without claiming an ML prediction? | Score components, order independence and shortlist movement tested |
| Data integration | How should CSV fields be joined by stable LGA identity while retaining provenance and missing values? | Import script validates all 56 names/codes and emits a quality report |
| UI review | How can profile cards remain concise and accessible while showing image attribution? | Production build and page review completed |

## Controls applied

- No AI suggestion was accepted as a factual source without a recorded dataset or licence source.
- User preferences are not sent to an AI service by the application and are not stored in local storage.
- Automated tests and production builds are the acceptance evidence, not the apparent fluency of generated code.
- AI contributions are disclosed; team members retain authorship and review responsibility.
