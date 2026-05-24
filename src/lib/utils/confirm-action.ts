import { mount, unmount } from 'svelte';
import ConfirmActionModal from '../ui/ConfirmActionModal.svelte';

export function confirmAction(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    let settled = false;

    const cleanup = async (result: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      await unmount(component);
      target.remove();
      resolve(result);
    };

    const component = mount(ConfirmActionModal, {
      target,
      props: {
        title,
        message,
        onConfirm: () => {
          void cleanup(true);
        },
        onCancel: () => {
          void cleanup(false);
        }
      }
    });
  });
}
