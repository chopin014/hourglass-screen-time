# Changelog

All notable changes to Hourglass are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-12

### Added
- **Timer on Websites:** a glass countdown pill with a progress ring on every website that has a Time Allowance. You can drag it to any corner. It turns orange at 5 minutes left and red in the last minute. In fullscreen it stays hidden until the last 5 minutes.
- **Direct Links:** open a single shared video or post (YouTube, Reddit, X, Instagram, TikTok) after its allowance is used up. The rest of the site, including in-page navigation and new tabs opened from it, stays blocked. Includes a configurable daily limit.
- 24-hour time picker for Screen Time Schedule windows.

### Changed
- The block screen is laid out for desktop windows and its background is drawn without color banding.
- Unlimited allowances can be stepped down to a time limit (Unlimited → 1 hr).

### Fixed
- Category tiles in the Time Allowances header were misaligned.
- Schedule windows ending at 23:59 were shown as "until 00:00".

## [1.0.0] - 2026-11-12

### Added
- Activity reports (Day / Week), pickups, first used after pickup and notification counts.
- Time Allowances with a Shared Time Allowance, per-category and per-website limits, and All Others.
- Screen Time Schedule with day groups and time windows.
- Always Allowed websites, Content & Privacy Restrictions and a Screen Time passcode.
- iOS-style block screen with Ignore Limit options, Time Check notifications and a weekly report.
- Toolbar widget, data export / import, light and dark appearance.

[1.1.0]: https://github.com/chopin014/hourglass-screen-time/releases/tag/v1.1.0
