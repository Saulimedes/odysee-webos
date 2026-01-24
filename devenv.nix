{ pkgs, ... }:

{
  # Project info
  name = "odysee-webos";

  # Enable JavaScript/Node.js
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };

  # Additional packages if needed
  packages = with pkgs; [
    # Add webos-ares-cli here if available, or other tools
  ];

  # Environment variables
  env = {
    NODE_ENV = "development";
  };

  # Scripts available in the shell
  scripts = {
    dev.exec = "npm start";
    build.exec = "npm run build";
    deploy.exec = "npm run deploy";
  };

  # Run on shell enter
  enterShell = ''
    echo ""
    echo "🎬 Odysee WebOS Development Environment"
    echo ""
    echo "Available commands:"
    echo "  npm install  - Install dependencies"
    echo "  dev          - Start dev server (port 3333)"
    echo "  build        - Build for production"
    echo "  deploy       - Deploy to TV"
    echo ""
  '';
}
