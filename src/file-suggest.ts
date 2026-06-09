export interface FileSuggestHandle {
	isActive(): boolean;
}

export function attachFileSuggest(_el: HTMLElement): FileSuggestHandle {
	// Stub: attach file suggest
	return {
		isActive: () => false,
	};
}
