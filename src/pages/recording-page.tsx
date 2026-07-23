import { PageHeader } from '../components/ui';
import { RecordingStation } from '../components/recording-station';
import { UploadDrawer } from '../components/upload-drawer';

export function RecordingPage() {
  return (
    <>
      <PageHeader title="Perekaman" description="Tampilkan barcode sebelum proses packing. Sistem membuat satu video untuk setiap barcode." />
      <RecordingStation />
      <div className="section-gap"><UploadDrawer /></div>
    </>
  );
}
