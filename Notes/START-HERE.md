# Telugu States Atlas · workspace guide

**7.14.0 / 71400.** This workspace is the project. Nothing else needs to be unpacked.

| I want to… | Open this |
|---|---|
| Edit or run the atlas | [`Hugo-Project/README.md`](../Hugo-Project/README.md). For a local preview, run `hugo server --source Hugo-Project` from the workspace root with Hugo 0.131.0. |
| See the current houses | [`Hugo-Project/content/houses/`](../Hugo-Project/content/houses/). Start with [`palnadu_demo01.md`](../Hugo-Project/content/houses/palnadu_demo01.md). These 133 Markdown files match the 10 villages in [`Hugo-Project/data/settlements.json`](../Hugo-Project/data/settlements.json). There is no second house folder to maintain. |
| Find the Android app or build workflow | [`Android/README.md`](../Android/README.md) explains the wrapper and the local signed installer, `Android/Telugu-States-Atlas.apk`. The manual build definition lives at [`.github/workflows/build-android.yml`](../.github/workflows/build-android.yml); enable **Show hidden files** if needed. |
| Understand the project and its rules | [`Notes/MASTER-PROMPT.md`](MASTER-PROMPT.md) is the current continuation brief. It distinguishes the owner’s latest decisions from older plans. |
| See why the project changed | [`Notes/history/Milestone-evidence.md`](history/Milestone-evidence.md) traces the decisions. The [original owner brief](history/Telugu_States_CSRGO_Master_Prompt_v7_Combined.md) is preserved as history, not as the current specification. |
| Hand over to a new chat | [`Notes/NEW-CHAT-SETUP.md`](NEW-CHAT-SETUP.md) gives the folder layout, repository import steps and a **copy-and-paste opening message**. |

`palnadu_demo01.md` is a current fictional household. A file such as `demo_user1.md` in `content/houses/` belongs to an older edition. Historical notes mentioning those names are not resident records. The Android build uses the same Hugo project; do not copy the web project into `Android/` or commit the installer to Git.
