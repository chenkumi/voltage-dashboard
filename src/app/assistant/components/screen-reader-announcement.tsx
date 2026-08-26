type ScreenReaderAnnouncementProps = {
    threadStatus: string;
    messageStatus: string;
};

export const ScreenReaderAnnouncement = ({
    threadStatus,
    messageStatus,
}: ScreenReaderAnnouncementProps) => {
    return <>
        <div
            aria-label="Current Thread"
            id="screen-reader-announcement-thread"
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            {threadStatus}
        </div>
        <div
            aria-label="Current viewing range"
            id="screen-reader-announcement-message"
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            {messageStatus}
        </div>
    </>;
};
