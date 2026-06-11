import { requestUrl } from 'obsidian';

export interface BookSearchResult {
	title: string;
	author: string;
	coverUrl: string;
	isbn?: string;
}

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
	const q = query.trim();
	if (!q) return [];

	try {
		const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10`;
		const resp = await requestUrl({ url });
		const json = resp.json as { docs?: Array<Record<string, unknown>> };
		const docs = Array.isArray(json.docs) ? json.docs : [];

		return docs.map((d) => {
			const title = String(d.title ?? '').trim();
			const author = Array.isArray(d.author_name) ? String(d.author_name[0] ?? '') : String(d.author_name ?? '');
			const coverId = typeof d.cover_i === 'number' ? d.cover_i : undefined;
			const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '';
			const isbn = Array.isArray(d.isbn) ? String(d.isbn[0] ?? '') : undefined;
			return { title, author, coverUrl, isbn: isbn || undefined };
		}).filter((b) => b.title);
	} catch {
		return [];
	}
}

export async function downloadCoverAsBlobUrl(url: string): Promise<string> {
	const u = url.trim();
	if (!u) return '';

	try {
		const resp = await requestUrl({ url: u });
		if (resp.arrayBuffer) {
			const contentType = resp.headers?.['content-type'] ?? 'image/jpeg';
			const blob = new Blob([resp.arrayBuffer], { type: contentType });
			return URL.createObjectURL(blob);
		}
		return '';
	} catch {
		return '';
	}
}
