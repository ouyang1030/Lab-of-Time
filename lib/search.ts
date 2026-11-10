import type { Item, Member } from './model';

/** Every query word may match any searchable field, independent of calendar dates. */
export function matchesSearch(item: Item, members: Member[], query: string): boolean {
  const words = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const owner = members.find(member => member.id === item.ownerId);
  const text = [item.title, item.description, item.location, item.url, item.date, item.type,
    item.status, item.priority, owner?.name ?? ''].join(' ').normalize('NFKC').toLocaleLowerCase();
  return words.every(word => text.includes(word));
}
