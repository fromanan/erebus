# Windows CA certificate adapter

Theia's proxy agent optionally loads `@vscode/windows-ca-certs`, a native module that requires Visual Studio's Spectre-mitigated C++ libraries. When those libraries are absent, Yarn correctly treats the native package as optional and removes it, but the current Theia Electron bundler still resolves its path unconditionally.

Erebus supplies the same small `Crypt32` iteration contract through Node's built-in `tls.getCACertificates('system')` API. This keeps Windows system certificate support, removes a machine-wide build prerequisite, and can be deleted when the upstream bundler no longer resolves a missing optional dependency.
