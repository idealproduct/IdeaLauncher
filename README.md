# IdeaLauncher

A modern, lightweight Minecraft Launcher built with **Electron**, **React**, and **TypeScript**.

IdeaLauncher aims to provide a simple and extensible Minecraft launching experience while keeping the launcher architecture easy to maintain and customize.

> **Status:** In Development

## Features

* Minecraft instance management
* Separate Minecraft instances
* Minecraft version management
* Mod and resource pack support
* Bundled Java runtime support
* Microsoft account authentication
* Minecraft launcher configuration
* Modern desktop UI
* Electron-based cross-platform architecture
* GPU selection before launching Minecraft

More features are planned as development continues.

## Tech Stack

### Application

* [Electron](https://www.electronjs.org/)
* [React](https://react.dev/)
* TypeScript
* [Vite](https://vite.dev/)

### Minecraft

* [XMCL](https://xmcl.app/)
* Minecraft Launcher metadata and asset services
* Java Runtime Environment

### UI

* Ant Design
* Tailwind CSS

### Package Manager

* pnpm

## Requirements

Before developing IdeaLauncher, make sure you have:

* Node.js
* pnpm
* Git

Check your installed versions:

```bash
node --version
pnpm --version
git --version
```

## Installation

Clone the repository:

```bash
git clone https://github.com/idealproduct/IdeaLauncher.git
cd IdeaLauncher
```

Install dependencies:

```bash
pnpm install
```

## Development

Start the development environment:

```bash
pnpm dev
```

This will start the Electron application through the Vite development environment.

## Build

Build the application:

```bash
pnpm build
```

The generated application can then be packaged using Electron Builder.

## Project Structure

```text
IdeaLauncher/
├── src/
│   ├── main/
│   │   └── ...
│   ├── preload/
│   │   └── ...
│   └── renderer/
│       └── ...
│
├── resources/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
└── README.md
```

The project is separated into three major Electron components:

### Main Process

Responsible for:

* Minecraft instance management
* File system operations
* Minecraft launching
* Downloading game files
* Java runtime management
* GPU configuration
* Electron application lifecycle

### Preload

Provides a controlled API between the Electron main process and the renderer.

### Renderer

Responsible for the graphical user interface.

The renderer is built with React and TypeScript.

## Minecraft Instances

IdeaLauncher stores each Minecraft instance separately.

A typical instance looks like:

```text
instances/
└── MyInstance/
    ├── instance.json
    ├── mods/
    ├── saves/
    └── resourcepacks/
```

Minecraft versions and shared game resources are managed separately from individual instances.

This allows multiple instances to share downloaded Minecraft libraries and versions while keeping instance-specific files isolated.

## Java Runtime

IdeaLauncher is designed to manage its own Java runtime rather than relying on the Java installation configured by the operating system.

This allows the launcher to provide a more consistent Minecraft environment across different systems.

## GPU Selection

IdeaLauncher is designed to allow users to select the GPU used by Minecraft before launching an instance.

This is particularly useful on systems with multiple GPUs, such as laptops with both integrated and discrete graphics.

The launcher can identify available GPU adapters and apply the selected adapter configuration when starting Minecraft.

## Authentication

Microsoft account authentication is planned through Microsoft's authentication system and XMCL's user/account functionality.

Authentication-related implementation is still under development.

## Roadmap

### Launcher

* [x] Basic Electron application
* [x] Minecraft instance structure
* [x] Basic instance management
* [x] Minecraft launching
* [ ] Minecraft version installer
* [ ] Instance editing
* [ ] Instance import/export
* [ ] Instance cloning

### Account

* [ ] Microsoft login
* [ ] Multiple account support
* [ ] Account switching

### Java

* [ ] Automatic Java installation
* [ ] Java version management
* [ ] Automatic Java version selection

### GPU

* [ ] Detect available GPUs
* [ ] GPU selection UI
* [ ] Per-instance GPU configuration
* [ ] Verify selected adapter at launch

### UI

* [ ] Home page
* [ ] Instance management
* [ ] Settings
* [ ] Download progress
* [ ] Launch status
* [ ] Error reporting
* [ ] Dark/light theme

### Distribution

* [ ] Windows packaging
* [ ] Linux packaging
* [ ] macOS packaging
* [ ] Automatic updates

## Contributing

Contributions, bug reports, and suggestions are welcome.

Before submitting a pull request, please make sure that:

* The project builds successfully.
* Existing functionality is not unnecessarily broken.
* New functionality is documented when appropriate.

## Disclaimer

IdeaLauncher is an independent Minecraft launcher project.

Minecraft is a trademark of Mojang Studios. IdeaLauncher is not affiliated with or endorsed by Mojang Studios or Microsoft.

## License

License information will be added when the project's licensing terms are finalized.
