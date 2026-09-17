import { Card, CardBody } from '../components/ui/Card';
import { IconShield } from '../components/ui/Icons';

/** Where a coordinator lands before the Main Admin has opened any page to them. */
export default function NoAccess() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <IconShield className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold text-gray-900">No pages have been opened to you yet</h2>
        <p className="max-w-sm text-sm text-gray-500">
          The Main Admin chooses which pages each coordinator can use. Ask them to open the pages
          you need, then reload this page.
        </p>
      </CardBody>
    </Card>
  );
}
