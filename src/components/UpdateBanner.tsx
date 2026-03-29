import React, { useEffect, useState } from 'react';
import UpdateModal from './UpdateModal';

const UpdateBanner: React.FC = () => {
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [parsedNotes, setParsedNotes] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const unsubAvailable = window.electronAPI.onUpdateAvailable((info: any) => {
            setUpdateInfo(info);
            setParsedNotes(info.parsedNotes || null);
            setIsVisible(true);
        });

        return () => {
            unsubAvailable();
        };
    }, []);

    const handleOpenDownloadPage = () => {
        window.electronAPI.downloadUpdate();
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <UpdateModal
            isOpen={isVisible}
            updateInfo={updateInfo}
            parsedNotes={parsedNotes}
            onDismiss={() => setIsVisible(false)}
            onOpenDownloadPage={handleOpenDownloadPage}
        />
    );
};

export default UpdateBanner;
