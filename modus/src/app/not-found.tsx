import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
export default function NotFound() {
  return (<><SiteHeader /><main className="wrap" style={{ paddingTop: 64, paddingBottom: 96 }}><div className="k" style={{ color: 'var(--ox)' }}>Not on file</div><h1 className="h1" style={{ fontSize: 56 }}>No such record</h1><p className="lede">Nothing by that name is in the database. <Link href="/">Open the index</Link> or search.</p></main></>);
}
