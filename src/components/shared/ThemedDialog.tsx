import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ThemedDialogProps {
    isOpen: boolean;
    onClose: () => void;
    isDaylight?: boolean;
    title: string;
    description?: string;
    headerActions?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidthClass?: string;
    /** Keep the dialog header (including its close button) visible while long content scrolls. */
    fitViewport?: boolean;
    /**
     * Blocks the two close paths this dialog owns - the X and the backdrop - while the caller is
     * mid-way through work a close would leave half-applied. Also dims the X so the wait shows:
     * a caller wrapping `onClose` instead would leave it looking live while it does nothing.
     */
    closeDisabled?: boolean;
    /** Native `title` for the dimmed X, naming the run that has to finish before closing. */
    closeDisabledTitle?: string;
}

const ThemedDialog: React.FC<ThemedDialogProps> = ({
    isOpen,
    onClose,
    isDaylight = false,
    title,
    description,
    headerActions,
    children,
    footer,
    maxWidthClass = 'max-w-md',
    fitViewport = false,
    closeDisabled = false,
    closeDisabledTitle,
}) => {
    const bgClass = isDaylight ? 'bg-white/90 border-white/30' : 'bg-zinc-900/95 border-white/10';
    const textPrimary = isDaylight ? 'text-zinc-900' : 'text-white';
    const textSecondary = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    const closeBtnHover = isDaylight ? 'hover:bg-zinc-200/60' : 'hover:bg-white/10';
    const isMouseDownOnOverlayRef = useRef(false);

    const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        isMouseDownOnOverlayRef.current = event.target === event.currentTarget;
    };

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (closeDisabled) return;
        if (event.target === event.currentTarget && isMouseDownOnOverlayRef.current) {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    data-folia-keyboard-window="true"
                    className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md ${fitViewport ? 'p-2 sm:p-4' : 'p-4'}`}
                    onMouseDown={handleOverlayMouseDown}
                    onClick={handleBackdropClick}
                >
                    <motion.div
                        initial={{ scale: 0.94, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.94, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                        onClick={(event) => event.stopPropagation()}
                        className={`relative w-full ${maxWidthClass} rounded-3xl border ${bgClass} shadow-2xl backdrop-blur-sm ${fitViewport ? 'flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden p-0' : 'p-6'}`}
                    >
                        <div className={`${fitViewport ? 'relative shrink-0 border-b border-white/10 px-4 py-3' : 'mb-5 pr-10'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <h2 className={`min-w-0 text-xl font-bold ${textPrimary} ${fitViewport ? 'pr-10 text-lg' : ''}`}>{title}</h2>
                                {headerActions && (
                                    <div className="shrink-0">{headerActions}</div>
                                )}
                            </div>
                            {fitViewport && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={closeDisabled}
                                    title={closeDisabled ? closeDisabledTitle : undefined}
                                    aria-label={title ? `关闭${title}` : '关闭'}
                                    className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors ${closeDisabled ? 'opacity-20' : `opacity-70 hover:opacity-100 ${closeBtnHover}`} ${textPrimary}`}
                                >
                                    <X size={18} />
                                </button>
                            )}
                            {description && (
                                // pre-line so a description can break where its meaning does rather
                                // than wherever the width happens to run out.
                                <p className={`mt-2 whitespace-pre-line text-sm ${textSecondary} ${fitViewport ? 'text-xs' : ''}`}>{description}</p>
                            )}
                        </div>

                        <div className={fitViewport ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-width:thin]' : ''}>{children}</div>

                        {footer && (
                            <div className={`flex shrink-0 items-center justify-end gap-3 ${fitViewport ? 'border-t border-white/10 px-4 py-3' : 'mt-5'}`}>
                                {footer}
                            </div>
                        )}

                        {!fitViewport && (
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={closeDisabled}
                                title={closeDisabled ? closeDisabledTitle : undefined}
                                aria-label={title ? `关闭${title}` : '关闭'}
                                className={`absolute right-4 top-4 rounded-full p-2 transition-colors ${closeDisabled ? 'opacity-20' : `opacity-50 hover:opacity-100 ${closeBtnHover}`} ${textPrimary}`}
                            >
                                <X size={18} />
                            </button>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ThemedDialog;
