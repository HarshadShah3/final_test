# Iteration 3 feedback decisions

This note records how the supplied mentor and team feedback was translated into the current local website update. It separates implemented work from items that need evidence, product approval or a later iteration.

## Accepted and implemented

- Standardised the saving action to **Add to Shortlist** / **Remove from Shortlist**.
- Added plain-language help text and tooltips around View Profile, shortlist, comparison and Towards 2050 actions.
- Replaced “Pick up to three” with an explicit instruction to choose **1–3 of six priority categories**, and clarified that nested filters do not count as extra priorities.
- Reordered the main journey to **Profile → Shortlist → Compare → Towards 2050**.
- Limited the shortlist to four regions and required exactly two regions before a comparison can open.
- Added a direct **Compare Selected Regions** action and kept the selected pair in browser storage across Shortlist, Compare and Towards 2050.
- Added next-step guidance on the map card and profile page.
- Reduced the profile image height so the data appears sooner.
- Added an expandable profile section containing reference periods, interpretation limits and links to official external data resources.
- Increased small map, source, shortlist, chart and action-label text; strengthened keyboard focus styling and minimum selector size.
- Simplified comparison emphasis: the stronger value is bold instead of being placed in another coloured box. Region columns use consistent, subtle backgrounds.
- Kept visible units and data sources, and exposed the database-supplied reference periods and limitations.
- Preserved the reviewed 2036 projection horizon and explicitly avoided presenting it as a verified 2050 forecast.

## Deferred pending evidence or a product decision

- Adding more map icons, suburb labels or background-region styling. The current map already has a legend and selected-region treatment; extra marks should be tested for readability before they are added.
- Redesigning every content group into a separate accordion. The profile now has one accessible “Further information” accordion; further collapsing could hide important decision data.
- Adding new location, family or lifestyle filters. These affect the recommendation model and need an agreed data contract and acceptance criteria before frontend controls are added.
- Claiming a quantified usability result such as “75% of users found the map too small.” The supplied feedback mentions this as an example, but a percentage must be calculated from the final tester sheet before it is used in the presentation or website.
- Additional visual changes from the tester sheet should be linked to a finding ID, participant count and severity before implementation.

## Future work, not part of this website update

- Natural-language preference input and NLP interpretation.
- AI-assisted recommendation explanations or chat support.
- Ethical and responsible-AI controls for any future AI feature.
- Revenue or sponsor-facing features.

These ideas remain in the backlog because they need new technical, ethical and product scope. They should not be presented as completed Iteration 3 work.

## Evidence and scope rule

For each new feedback item, record: source, affected user journey, severity, acceptance decision, implementation status and verification result. A change is accepted only when it improves the target relocation journey, uses available reviewed data and can be tested without inventing evidence.
