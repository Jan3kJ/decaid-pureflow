# Security

pureflow is a skin: a static web page that Decaid serves on the tablet. It talks only to the
Decaid on the same tablet, through Decaid's local gateway, and it stores nothing but its own
settings and the bags' photos, in the tablet's browser and in Decaid's key-value store. It sends
nothing to any other server; a few help links open Decent's web pages when tapped.

## Reporting a vulnerability

Please report a vulnerability privately, not in a public issue: on GitHub, open the repository's
**Security** tab and choose **Report a vulnerability**. Say which version of the skin and of
Decaid you use and how to reproduce it. You get an answer within two weeks.

## In scope

- the skin's own code in this repository and the ZIP of its releases;
- what the skin sends to Decaid's gateway (for example a profile or a setting that could harm
  the machine or the tablet's data).

Out of scope: Decaid itself, the DE1's firmware and Streamline; report those to
[Decent](https://github.com/decentespresso/decaid). Only the newest release is supported.
