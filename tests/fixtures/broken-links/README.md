# Broken Links Fixture

Exercises the doc graph and broken-link findings.

- [Guide](docs/guide.md) — valid, plain relative link.
- [Missing doc](docs/missing.md) — broken, target was deleted.
- [External](https://example.com/should-not-be-checked) — external, never checked.
- [Anchor only](#see-also) — same-document anchor, not a file target.
- [Guide section](docs/guide.md#section-two) — valid, anchor stripped before resolution.
- [Docs folder](docs/) — directory reference, not a file target.

![Logo](assets/logo.svg)

![Missing image](assets/missing.png)

## See Also

More text down here.
