# Iteration 1 Build Folder

This folder maps the Iteration 1 evidence to the requested build-folder items. It describes the implementation as it exists in the repository; it does not treat AI output or placeholder content as project data.

## Submission contents

| Requested item | Evidence |
| --- | --- |
| Development artefacts showing how the team reached the first cut | [Development artefacts](DEVELOPMENT_ARTIFACTS.md) and the repository commit history |
| Pair-programming observations | [Pair-programming notes](PAIR_PROGRAMMING_NOTES.md) |
| GitHub/code repository links and pairing notes | This file and [Pair-programming notes](PAIR_PROGRAMMING_NOTES.md) |
| First cut of technology | [Technology and data model](TECHNOLOGY_AND_DATA_MODEL.md) |
| Project logic and code implementation | [Project logic and implementation](../Australia_2050_项目逻辑与代码实现说明.md) |
| AI-use statement | [AI-use declaration](AI_USE_DECLARATION.md) |

## Repository links

- Private repository: <https://github.com/ayushi257/FIT5120-TP25-Simulate-AU-2050>
- Integrated website branch: <https://github.com/ayushi257/FIT5120-TP25-Simulate-AU-2050/tree/feature/website-frontend-backend>
- Data-cleaning branch: <https://github.com/ayushi257/FIT5120-TP25-Simulate-AU-2050/tree/feature/employment-housing-data-cleaning>

Because the repository is private, a repository administrator must invite the academic mentors using their supplied GitHub usernames before submission. No username has been invented in this document.

## Verified build snapshot — 3 September 2026

- Frontend production build: passed (`vite build`, 1,839 modules transformed).
- Backend automated tests: 25 passed, 0 failed (`node --test`).
- Regional dataset: 56 records.
- Map coverage: 56 matching LGA polygons over the complete Victoria boundary.
- Regional photography: 56 images and 56 recorded source/licence entries; no missing regional image.
