#!/usr/bin/env node

import { Command } from "commander";
import conventionalChangelog from "conventional-changelog";
import yaml from "js-yaml";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import semver from "semver";

const program = new Command();

program
  .version("1.0.0")
  .description(
    "A CLI for managing package versions and publishing in mono/single repos"
  )
  .option(
    "-d, --packages-dir <dir>",
    "Specify the packages directory name",
    "packages"
  );

program
  .command("list")
  .description(
    "List all packages in a monorepo or show root package.json for single repo"
  )
  .action(listPackages);

program
  .command("version <type>")
  .description("Update package versions")
  .option("-d, --dry-run", "Perform a dry run")
  .action(updateVersion);

program
  .command("tag")
  .description("Tag packages")
  .option("-d, --dry-run", "Perform a dry run")
  .action(tagPackage);

program
  .command("publish")
  .description("Publish packages to npm")
  .option("-d, --dry-run", "Perform a dry run")
  .action(publishPackages);

program
  .command("changelog")
  .description("Generate changelogs")
  .option("-d, --dry-run", "Perform a dry run")
  .action(generateChangelogs);

program.parse(process.argv);

async function listPackages() {
  const rootDir = process.cwd();
  const packagesDir = program.opts().packagesDir;

  try {
    const isMonorepo = await isMonorepoProject(rootDir);

    if (isMonorepo) {
      const packages = await getPackages(rootDir);
      packages.forEach((pkg) => {
        console.log(`- ${pkg.name} (${pkg.path})`);
      });
    } else {
      const rootPackageJson = await fs.readFileSync(
        path.join(rootDir, "pnpm-workspace.yaml"),
        "utf8"
      );
      const packageData = JSON.parse(rootPackageJson);
      console.log("Root package.json:");
      console.log(JSON.stringify(packageData, null, 2));
    }
  } catch (error) {
    console.error("Error listing packages:", error.message);
  }
}

async function isMonorepoProject(dir) {
  try {
    await fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    return true;
  } catch (error) {
    return false;
  }
}

function getPackages(dir) {
  const packagesDir = program.opts().packagesDir;
  const isMonorepo = fs.existsSync(path.join(dir, "pnpm-workspace.yaml"));
  let packages = [];

  if (isMonorepo) {
    const workspaceConfig = yaml.load(
      fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8")
    );

    const packageGlobs = workspaceConfig.packages || [`${packagesDir}/*`];

    packageGlobs.forEach((glob) => {
      const matchingDirs = execSync(`find ${dir} -type d -path "${glob}"`, {
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);

      matchingDirs.forEach((packageDir) => {
        if (fs.existsSync(path.join(packageDir, "package.json"))) {
          packages.push({
            name: require(path.join(packageDir, "package.json")).name,
            path: packageDir,
          });
        }
      });
    });
  } else {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8")
    );
    const name = pkg.name;

    packages.push({
      name,
      path: dir,
    });
  }

  return packages;
}

function updateVersion(type, options) {
  const packages = getPackages(process.cwd());
  const updatedPackages = new Set();

  packages.forEach((pkg) => {
    const packageJsonPath = path.join(pkg.path, "package.json");
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(pkg.path, "package.json"), "utf8")
    );

    const version = packageJson.version;

    const oldVersion = version;
    const newVersion = semver.inc(oldVersion, type);

    console.log(`Updating ${pkg.name} from ${oldVersion} to ${newVersion}`);

    if (!options.dryRun) {
      packageJson.version = newVersion;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    updatedPackages.add(pkg.name);
  });

  // Update dependencies
  // packages.forEach((pkg) => {
  //   const packageJsonPath = path.join(pkg.path, "package.json");
  //   const packageJson = JSON.parse(
  //     fs.readFileSync(path.join(pkg.path, "package.json"), "utf8")
  //   );

  //   let updated = false;

  //   ["dependencies", "devDependencies", "peerDependencies"].forEach(
  //     (depType) => {
  //       if (packageJson[depType]) {
  //         Object.keys(packageJson[depType]).forEach((dep) => {
  //           if (updatedPackages.has(dep)) {
  //             const newVersion = require(path.join(
  //               process.cwd(),
  //               dep,
  //               "package.json"
  //             )).version;
  //             console.log(
  //               `Updating ${dep} in ${pkg.name} ${depType} to ${newVersion}`
  //             );
  //             if (!options.dryRun) {
  //               packageJson[depType][dep] = `^${newVersion}`;
  //               updated = true;
  //             }
  //           }
  //         });
  //       }
  //     }
  //   );

  //   if (updated && !options.dryRun) {
  //     fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  //   }
  // });

  if (!options.dryRun) {
    console.log(
      "Version update completed. Remember to commit these changes if needed."
    );
  }
}

function tagPackage(options) {
  const packages = getPackages(process.cwd());
  const updatedPackages = new Set();

  packages.forEach((pkg) => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(pkg.path, "package.json"), "utf8")
    );

    const version = packageJson.version;

    if (!options.dryRun) {
      // Create and push tag
      const tagName = `v${version}`;
      execSync(`git tag ${tagName}`);
      execSync(`git push origin ${tagName}`);
      console.log(`Pushed tag: ${tagName}`);
    }

    updatedPackages.add(pkg.name);
  });

  if (!options.dryRun) {
    console.log(
      "Version update completed. Remember to commit these changes if needed."
    );
  }
}

function publishPackages(options) {
  const packages = getPackages(process.cwd());

  packages.forEach((pkg) => {
    const packageJsonPath = path.join(pkg.path, "package.json");
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(pkg.path, "package.json"), "utf8")
    );
    const version = packageJson.version;

    console.log(`Publishing ${pkg.name}@${version}`);

    if (!options.dryRun) {
      try {
        execSync(`cd ${pkg.path} && pnpm publish --no-git-checks`, {
          stdio: "inherit",
        });
        console.log(`Successfully published ${pkg.name}@${version}`);

        // Revert package.json changes
        execSync(`git checkout -- ${packageJsonPath}`);
      } catch (error) {
        console.error(`Failed to publish ${pkg.name}: ${error.message}`);
      }
    }
  });

  if (!options.dryRun) {
    console.log("Publish completed.");
  }
}

function generateChangelogs(options) {
  const packages = getPackages(process.cwd());
  const rootDir = process.cwd();

  // Generate root changelog
  // const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8")
  );
  generateChangelogForPackage(rootDir, packageJson.name, options);

  // Generate changelog for each package
  // packages.forEach((pkg) => {
  //   generateChangelogForPackage(pkg.path, pkg.name, options);
  // });
}

function generateChangelogForPackage(packagePath, packageName, options) {
  const changelogPath = path.join(packagePath, "CHANGELOG.md");
  console.log(`Generating changelog for ${packageName}`);

  if (!options.dryRun) {
    const changelogStream = conventionalChangelog({
      preset: "conventionalcommits",
      releaseCount: 1,
      skipUnstable: true,
      pkg: {
        path: path.join(packagePath, "package.json"),
      },
    });

    let changelog = "";
    changelogStream.on("data", (chunk) => {
      changelog += chunk.toString();
    });

    changelogStream.on("end", () => {
      fs.writeFileSync(changelogPath, changelog);
      console.log(`Changelog generated for ${packageName}`);
    });
  }
}
