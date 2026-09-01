# Contributing

Contributions are welcome, especially reproducibility fixes, additional tests
and clearly scoped benchmark adapters.

Before opening a pull request:

1. Use Node.js 22.17 or newer and install with `npm ci`.
2. Run `npm audit --omit=dev`, `npm test` and
   `npm run showcase:audit:methodology`.
3. Do not commit model weights, benchmark images/questions, checkpoints,
   generated videos, personal data or credentials.
4. Keep benchmark changes versioned. Record dataset checksum, exact prompt,
   scorer revision, generation settings, model/projector hashes and execution
   order. Never overwrite evidence from an older protocol.
5. Label local heuristic analyses as such. Do not describe a local run as an
   official vendor reproduction unless every relevant upstream condition is
   demonstrably identical.

Code is Apache-2.0. Dataset, model and personal-photo rights remain separate;
see `THIRD_PARTY_NOTICES.md`.
