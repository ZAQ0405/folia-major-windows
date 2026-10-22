import React, { useEffect, useMemo, useRef } from 'react';
import { List, useListRef } from 'react-window';
import type { UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import SearchResultRow from './SearchResultRow';

// src/components/app/search/SearchResultsList.tsx

type SearchResultsListProps = {
    tracks: UnifiedSong[];
    scrollTop: number;
    isDaylight: boolean;
    isCompact: boolean;
    onScrollTopChange: (scrollTop: number) => void;
    onPlayTrack: (track: UnifiedSong) => void;
    onAddTrackToQueue: (track: UnifiedSong) => void;
    onOpenArtist: (track: UnifiedSong, artistName: string, artistId?: MediaId, entityId?: string) => void;
    onOpenAlbum: (track: UnifiedSong, albumName: string, albumId?: MediaId, entityId?: string) => void;
    hasMore: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    loadMoreLabel: string;
    loadingMoreLabel: string;
};

type RowProps = Omit<SearchResultsListProps, 'scrollTop' | 'onScrollTopChange'>;

const Row = ({
    index,
    style,
    tracks,
    isCompact,
    isDaylight,
    hasMore: _hasMore,
    isLoadingMore,
    onLoadMore,
    loadMoreLabel,
    loadingMoreLabel,
    ...rowProps
}: { index: number; style: React.CSSProperties } & RowProps) => {
    const compactTrackCount = Math.ceil(tracks.length / 2);

    if (isCompact && index >= compactTrackCount) {
        return (
            <div style={style} className="folia-search-more-row">
                <button
                    type="button"
                    disabled={isLoadingMore}
                    onClick={onLoadMore}
                    className={`rounded-full border px-4 py-1.5 text-xs disabled:opacity-50 ${
                        isDaylight
                            ? 'border-black/10 bg-black/5 hover:bg-black/10'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                >
                    {isLoadingMore ? loadingMoreLabel : loadMoreLabel}
                </button>
            </div>
        );
    }

    if (isCompact) {
        const trackIndexes = [index * 2, index * 2 + 1].filter(trackIndex => trackIndex < tracks.length);
        const cardStyle: React.CSSProperties = {
            position: 'relative',
            width: '100%',
            height: '100%',
            minWidth: 0,
        };

        return (
            <div style={style} className="folia-search-result-grid">
                {trackIndexes.map(trackIndex => (
                    <SearchResultRow
                        key={tracks[trackIndex].id}
                        track={tracks[trackIndex]}
                        style={cardStyle}
                        isCompact
                        isDaylight={isDaylight}
                        onPlayTrack={rowProps.onPlayTrack}
                        onAddTrackToQueue={rowProps.onAddTrackToQueue}
                        onOpenArtist={rowProps.onOpenArtist}
                        onOpenAlbum={rowProps.onOpenAlbum}
                    />
                ))}
            </div>
        );
    }

    return (
        <SearchResultRow
            track={tracks[index]}
            style={style}
            isCompact={isCompact}
            isDaylight={isDaylight}
            onPlayTrack={rowProps.onPlayTrack}
            onAddTrackToQueue={rowProps.onAddTrackToQueue}
            onOpenArtist={rowProps.onOpenArtist}
            onOpenAlbum={rowProps.onOpenAlbum}
        />
    );
};

const SearchResultsList: React.FC<SearchResultsListProps> = ({
    tracks,
    scrollTop,
    onScrollTopChange,
    isCompact,
    hasMore,
    ...rowProps
}) => {
    const listRef = useListRef(null);
    const latestScrollTopRef = useRef(scrollTop);
    const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stableRowProps = useMemo(() => ({ tracks, hasMore, isCompact, ...rowProps }), [hasMore, isCompact, rowProps, tracks]);

    useEffect(() => {
        const element = listRef.current?.element;
        if (element && Math.abs(element.scrollTop - scrollTop) > 1) {
            element.scrollTop = scrollTop;
        }
        latestScrollTopRef.current = scrollTop;
    }, [listRef, scrollTop, tracks]);

    useEffect(() => () => {
        if (commitTimerRef.current) {
            clearTimeout(commitTimerRef.current);
        }
        onScrollTopChange(latestScrollTopRef.current);
    }, [onScrollTopChange]);

    return (
        <List
            listRef={listRef}
            rowCount={(isCompact ? Math.ceil(tracks.length / 2) : tracks.length) + (isCompact && hasMore ? 1 : 0)}
            rowHeight={isCompact ? 34 : 76}
            rowComponent={Row as any}
            rowProps={stableRowProps}
            overscanCount={6}
            className="custom-scrollbar"
            style={{ height: '100%', width: '100%' }}
            onScroll={(event) => {
                latestScrollTopRef.current = event.currentTarget.scrollTop;
                if (commitTimerRef.current) {
                    clearTimeout(commitTimerRef.current);
                }
                commitTimerRef.current = setTimeout(() => {
                    onScrollTopChange(latestScrollTopRef.current);
                }, 120);
            }}
        />
    );
};

export default SearchResultsList;
