import re,json,pathlib,collections,sys
root=pathlib.Path(__file__).resolve().parents[2]
if len(sys.argv)!=2: raise SystemExit('Usage: python scripts/research/extract-inventory.py DIRECTORY_OF_PUBLIC_MD_FILES')
docs=pathlib.Path(sys.argv[1])
catmap={'security/antinuke':'antinuke','security/automod':'automod','security/moderation':'moderation','security/jail':'moderation','security/mainrole':'permit','configuration/roles/autorole':'automations','configuration/roles/reaction':'reactionroles','configuration/roles/custom':'customrole','configuration/roles/guildtag':'vanityroles','configuration/roles/vcrole':'voice','configuration/autoresponder':'autoresponder','configuration/autoreact':'automations','configuration/antibot':'automod','configuration/welcome':'welcomer','configuration/logging':'logging','configuration/tickets':'ticket','configuration/media':'automod','configuration/ignore':'permit','configuration/voicemaster':'voicemaster','configuration/leaderboard':'leaderboard','configuration/eventmanager':'automations','miscellaneous/utility':'utility','miscellaneous/embed':'utility','miscellaneous/fun':'fun','miscellaneous/music':'music','miscellaneous/giveaway':'giveaway','overview/customization':'general','overview/setup':'general','index':'general'}
rows={}; evidence=[]; alias_pairs=[]
def add(line,cat,desc,url,tag):
 line=line.strip()
 if not re.match(r'^[,?/][a-z0-9]',line):return
 tokens=line[1:].split();parts=[]
 for t in tokens:
  if re.fullmatch(r'[a-z0-9][a-z0-9_-]*',t):parts.append(t)
  else:break
 if not parts:return
 name=' '.join(parts)
 if name.startswith('voice '):cat='voice'
 key=(cat,name)
 params=[{'name':m.group(2),'required':m.group(1) in ('(', '<'),'referenceNotation':m.group(0)} for m in re.finditer(r'(\(|\[|<)([^)\]>]+)[)\]>]',line)]
 note='Documented reference syntax, not a live-tested Zynrax command. Permissions and aliases not stated are unknown; empty arrays do not mean none. Category is Luna planning mapping. Prefix differs across Zynrax documentation. '+tag
 if key not in rows:rows[key]={'name':name,'category':cat,'syntax':line,'description':desc,'parameters':params,'userPermissions':[],'botPermissions':[],'aliases':[],'referenceVerified':True,'implemented':False,'tested':False,'notes':note,'source':url}
 elif line not in rows[key]['syntax'].split('\n'):rows[key]['syntax']+='\n'+line;rows[key]['notes']+=' Multiple documented variants; do not split these into fake command counts.'
 evidence.append({'category':cat,'name':name,'syntax':line,'source':url,'evidenceType':tag})
for p in sorted(docs.glob('*.md')):
 path=p.name[:-3].replace('__','/');cat=catmap.get(path)
 if not cat:continue
 s=p.read_text();url='https://docs.zynrax.site/'+path+('.md' if path=='index' else '')
 # Extract only explicitly labelled non-example code blocks, with nearest heading and actual surrounding prose.
 for m in re.finditer(r'```([^\n]+)\n(.*?)```',s,re.S):
  label=m.group(1)
  if 'Example' in label or 'example' in label:continue
  prefix=s[:m.start()];headings=list(re.finditer(r'^#{1,4} (.+)$',prefix,re.M))
  head=headings[-1] if headings else None
  title=re.sub(r'<[^>]+>','',head.group(1)).strip() if head else path
  context=prefix[head.end():] if head else ''
  context=re.sub(r'```[^\n]*\n.*?```','',context,flags=re.S)
  context=re.sub(r'<[^>]+>','',context).strip()
  context=re.sub(r'\s+',' ',context).strip()
  desc=context.split('<CodeGroup>')[0].strip() or title
  # descriptions are actual extracted text, not invented behavior
  if len(desc)>450:desc=title+' (see source for full description).'
  if 'Shortcut' in label:
   group=prefix[prefix.rfind('<CodeGroup>'):]
   primary=re.search(r'```bash Syntax[^\n]*\n\s*([,?/][^\n]+)',group)
   if primary:
    for line in m.group(2).splitlines():
     if line.strip().startswith((',', '?','/')):alias_pairs.append((cat,primary.group(1).strip(),line.strip()[1:]))
   continue
  for line in m.group(2).splitlines():add(line,cat,desc,url,'Labelled documentation code block: '+label)
 # Command-description table entries are primary documentation too.
 for m in re.finditer(r'^\|\s*`([,?][^`]+)`\s*\|\s*([^|]+)\|',s,re.M):add(m.group(1),cat,m.group(2).strip(),url,'Documented command table.')
 # Individual inline explicit no-parameter syntax, excluding placeholders/examples.
 for m in re.finditer(r'`([,?][a-z0-9][a-z0-9_-]*(?: [a-z][a-z0-9_-]*)*)`',s):
  key=(cat,m.group(1)[1:])
  if key not in rows and m.group(1) in ['?security', ',unslowmode']:add(m.group(1),cat,'Documented inline command; see source for behavior.',url,'Inline command mention; no parameters established.')
for cat,primary,alias in alias_pairs:
 name=' '.join(t for t in primary[1:].split() if re.fullmatch('[a-z0-9][a-z0-9_-]*',t))
 if (cat,name) in rows:rows[(cat,name)]['aliases'].append(alias)
# The documentation's default prefix change syntax is explicit on the home page.
add('?prefixset (symbol)','general','Change the server command prefix.','https://docs.zynrax.site/','Home-page explicit inline syntax.')
items=sorted(rows.values(),key=lambda r:(r['category'],r['name']))
# Preserve separately inspected visual evidence; text parser must not erase it.
existing=json.loads((root/'data/commands.json').read_text())
for visual in existing:
 if 'Visually verified official documentation screenshot' in visual.get('notes','') and not any((r['category'],r['name'])==(visual['category'],visual['name']) for r in items):items.append(visual)
old_evidence=json.loads((root/'data/reference-evidence.json').read_text())
evidence.extend(e for e in old_evidence if e.get('imageSource'))
items.sort(key=lambda r:(r['category'],r['name']))
(root/'data/commands.json').write_text(json.dumps(items,indent=2)+'\n')
(root/'data/reference-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
status=json.loads((root/'data/reference-status.json').read_text());status.update(verifiedReferenceCommands=len(items),status='Official-docs text and preserved visual inventory; full advertised541-help inventory remains unverified.',publicMarkdownPagesRead=34)
status['observedCountClaims']=[{'source':'https://www.zynrax.site','method':'text fetch','count':'539+'},{'source':'https://www.zynrax.site/','method':'browser settled animation','count':'541+'}]
(root/'data/reference-status.json').write_text(json.dumps(status,indent=2)+'\n')
print('Inventory:',len(items),'reference entries; by category:',dict(collections.Counter(r['category'] for r in items)))
print('Names:')
for c in catmap.values():
 pass
for c in sorted(set(r['category'] for r in items)):print(c,', '.join(r['name'] for r in items if r['category']==c))
