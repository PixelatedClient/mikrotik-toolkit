import { getAffiliatesByTag, getAffiliatesByCategory, type AffiliateLink } from '../data/affiliates';

interface Props {
  tag?: string;
  category?: AffiliateLink['category'];
  title?: string;
}

export default function AffiliateLinks({ tag, category, title }: Props) {
  let links: AffiliateLink[] = [];

  if (tag) {
    links = getAffiliatesByTag(tag);
  } else if (category) {
    links = getAffiliatesByCategory(category);
  }

  if (!links.length) return null;

  return (
    <div className="not-prose rounded-lg border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-fg">
        {title || 'Related Resources'}
      </h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.name} className="text-sm">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {link.name}
            </a>
            <p className="mt-1 text-xs text-muted">{link.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
