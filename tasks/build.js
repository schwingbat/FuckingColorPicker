const path = require("path");
const fs = require("fs");
const packager = require("electron-packager");
const archiver = require("archiver");
const del = require("delete");
const mkdirp = require("mkdirp");
const package = require("../package.json");

const ZIP = process.argv.includes("--zip");

del(["dist/*", "tmp/*"], err => {
    if (err) throw err;

    mkdirp("tmp/", err => { 
        if (err) throw err;

        packager({
            name: "FCP",
            dir: ".",
            arch: "x64",
            electronVersion: "1.6.1",
            icon: "./build/icon",
            ignore: ["tasks", "assets", "build", "dist", "README.md", "fcp.png", "window-state"],
            prune: true,
            overwrite: true,
            out: "./tmp",
            platform: ["linux", "win32", "darwin"],
        }, function done(err, paths) {
            if (err) {
                throw err;
            }

            const total = paths.length;
            let finished = 0;

            function done() {
                finished++;

                if (finished === total) {
                    del(["tmp"], err => {
                        if (err) throw err;
                        return console.log("Packaged successfully!");
                    });
                }
            }

            paths.forEach(p => {
                let d = p.split(/\\|\//);
                let f = d.pop();

                let newName = f
                    .replace("win32", "windows")
                    .replace("darwin", "mac")
                    .replace("-x64", "");
                
                newName += "-" + package.version;

                fs.rename(path.join("tmp", f), path.join("tmp", newName), (err) => {
                    if (err) {
                        throw err;
                    }

                    console.log(`Zipping ${ newName.split("-")[1] } bundle...`);
                    const output = fs.createWriteStream(path.join("dist", newName + '.zip'));
                    const archive = archiver("zip", {
                        zlib: { compression: 9 }
                    });

                    output.on("close", () => {
                        let s = newName.split("-")[1];
                        let platform = s[0].toUpperCase() + s.slice(1);

                        console.log(`${ platform } bundle zipped.`);
                        done();
                    });

                    archive.on("error", (err) => {
                        throw err;
                    });

                    archive.pipe(output);

                    archive.directory(path.join("tmp", newName), false);
                    archive.finalize();
                });
            });
        });
    });
});