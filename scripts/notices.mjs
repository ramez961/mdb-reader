import {readdir,readFile,writeFile} from 'node:fs/promises';
const root='node_modules/.pnpm';const packages=new Map();
for(const entry of await readdir(root,{withFileTypes:true})) {
  if(!entry.isDirectory())continue;
  const directory=`${root}/${entry.name}/node_modules`;
  let children;try{children=await readdir(directory,{withFileTypes:true});}catch{continue;}
  for(const child of children){
    if(child.name.startsWith('.'))continue;
    const paths=child.name.startsWith('@')?(await readdir(`${directory}/${child.name}`)).map(name=>`${directory}/${child.name}/${name}`):[`${directory}/${child.name}`];
    for(const path of paths){
      try{
        const pkg=JSON.parse(await readFile(`${path}/package.json`,'utf8'));
        if(pkg.name==='esbuild'||pkg.name.startsWith('@esbuild/'))continue;
        const key=`${pkg.name}@${pkg.version}`;if(packages.has(key))continue;
        const files=(await readdir(path)).filter(name=>/^(license|licence|copying|notice)([.-]|$)/i.test(name));
        const texts=[];for(const file of files)try{texts.push(`${file}\n${await readFile(`${path}/${file}`,'utf8')}`);}catch{}
        if(!texts.length&&pkg.name.startsWith('@nodable/'))texts.push(`Upstream license: https://github.com/nodable/val-parsers/blob/main/LICENSE\n${await readFile('scripts/licenses/nodable.txt','utf8')}`);
        if(!texts.length){const readme=await readFile(`${path}/README.md`,'utf8').catch(()=>'');const start=readme.search(/^#+ License/m);if(start>=0)texts.push(readme.slice(start));}
        if(!texts.length)throw Error(`No license file for ${key}`);
        packages.set(key,`${key}\nDeclared license: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license)}\n${texts.join('\n\n')}`);
      }catch(e){if(e.message.startsWith('No license'))throw e;}
    }
  }
}
await writeFile('THIRD_PARTY_NOTICES.txt',`Third-party dependency notices\n\nThese terms apply to their respective third-party code, not to the original application code.\nmdb-reader 3.2.0 is modified by scripts/build.mjs to expose bounded page reads and enforce metadata limits.\n\n${[...packages.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,text])=>text).join('\n\n'+'='.repeat(72)+'\n\n')}\n`);
console.log(`Preserved license texts for ${packages.size} packages.`);
