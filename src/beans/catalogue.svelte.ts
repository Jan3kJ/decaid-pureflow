// The bean and grinder catalogue as the screens read it (spec 3.9 item 19, research.md 29.6):
// read from Decaid when the beans screen or the pick opens, written and read back, with the
// last error. A part of `Skin`; the pick writes the skin's workflow (`CatalogueHost`).
import type { BeanBatch, CatalogueBean, DecaidClient, Grinder, Workflow } from '../api';
import { errorMessage } from '../error-message';
import {
  addBean,
  currentBatch,
  grinderInput,
  grinderPatch,
  newBag,
  pickContext,
  saveBean,
  type BeanForm,
  type GrinderForm,
  type NextShotPick,
} from './catalogue';
import { isPhoto, orphanPhotoKeys, photoKey } from './photo';

/** What the catalogue reads and writes of the skin. */
export interface CatalogueHost {
  readonly client: DecaidClient;
  workflow: Workflow | null;
}

export class Catalogue {
  /** every bean, archived ones too; the screens filter */
  beans: CatalogueBean[] = $state.raw([]);
  /** every bag of every bean, archived ones too */
  batches: BeanBatch[] = $state.raw([]);
  grinders: Grinder[] = $state.raw([]);
  /** the catalogue was read once */
  loaded = $state(false);
  /** a write or a read runs */
  busy = $state(false);
  /** what went wrong with the last read or write, for the user */
  error: string | null = $state(null);
  private readonly host: CatalogueHost;

  constructor(host: CatalogueHost) {
    this.host = host;
  }

  /** A bean's current bag, null for none. */
  batchOf(bean: CatalogueBean | null): BeanBatch | null {
    return bean ? currentBatch(this.batches, bean.id) : null;
  }

  /**
   * Reads beans, bags and grinders, archived ones included: three requests. Then the photos of
   * beans that are gone (deleted in another app) are deleted from the KV store.
   */
  async load(): Promise<void> {
    this.busy = true;
    try {
      await this.read();
      this.error = null;
      await this.deleteOrphanPhotos();
    } catch (error) {
      this.error = `The beans and grinders were not read: ${errorMessage(error)}`;
    } finally {
      this.busy = false;
    }
  }

  private async read(): Promise<void> {
    const { client } = this.host;
    const [beans, batches, grinders] = await Promise.all([
      client.listBeans(true),
      client.listAllBatches(true),
      client.listGrinders(true),
    ]);
    this.beans = beans;
    this.batches = batches;
    this.grinders = grinders;
    this.loaded = true;
  }

  private async deleteOrphanPhotos(): Promise<void> {
    const { client } = this.host;
    try {
      const keys = await client.kvKeys();
      const orphans = orphanPhotoKeys(
        Array.isArray(keys) ? keys : [],
        this.beans.map((bean) => bean.id),
      );
      await Promise.all(orphans.map((key) => client.kvDelete(key)));
    } catch {
      // tried again at the next read
    }
  }

  /** A bean's photo of its bag, null for none. */
  async photoOf(beanId: string): Promise<string | null> {
    try {
      const value = await this.host.client.kvGet(photoKey(beanId));
      return isPhoto(value) ? value : null;
    } catch (error) {
      this.error = `The photo was not read: ${errorMessage(error)}`;
      return null;
    }
  }

  /** Stores a bean's photo, or deletes it for null. */
  private async storePhoto(beanId: string, photo: string | null): Promise<boolean> {
    const { client } = this.host;
    try {
      if (photo) await client.kvSet(photoKey(beanId), photo);
      else await client.kvDelete(photoKey(beanId));
      return true;
    } catch (error) {
      this.error = `The photo was not ${photo ? 'stored' : 'deleted'}: ${errorMessage(error)}`;
      return false;
    }
  }

  /** One write, then the catalogue read back; null and the error when it failed. */
  private async write<T>(what: string, run: () => Promise<T>): Promise<T | null> {
    this.busy = true;
    this.error = null;
    try {
      const result = await run();
      await this.read();
      return result;
    } catch (error) {
      this.error = `${what}: ${errorMessage(error)}`;
      return null;
    } finally {
      this.busy = false;
    }
  }

  /** Adds a bean with its first bag, and its photo; gives the bean's id. */
  async addBean(form: BeanForm, photo: string | null = null): Promise<string | null> {
    const added = await this.write('The bean was not added', () => addBean(this.host.client, form));
    if (added && photo) await this.storePhoto(added.bean.id, photo);
    return added?.bean.id ?? null;
  }

  /** Saves an edit; `photo` is the new photo, null to delete it, undefined to keep it. */
  async saveBean(bean: CatalogueBean, form: BeanForm, photo?: string | null): Promise<boolean> {
    const saved =
      (await this.write('The bean was not saved', () => saveBean(this.host.client, bean, this.batchOf(bean), form))) !== null;
    return saved && (photo === undefined || (await this.storePhoto(bean.id, photo)));
  }

  /** Archives a bean, or restores it with `archived` false. */
  async archiveBean(bean: CatalogueBean, archived: boolean): Promise<boolean> {
    const what = archived ? 'The bean was not archived' : 'The bean was not restored';
    return (await this.write(what, () => this.host.client.updateBean(bean.id, { archived }))) !== null;
  }

  async newBag(bean: CatalogueBean): Promise<boolean> {
    return (await this.write('The new bag was not started', () => newBag(this.host.client, bean.id, this.batchOf(bean)))) !== null;
  }

  /** Adds a grinder; gives its id. */
  async addGrinder(form: GrinderForm): Promise<string | null> {
    const added = await this.write('The grinder was not added', () => this.host.client.createGrinder(grinderInput(form)));
    return added?.id ?? null;
  }

  async saveGrinder(grinder: Grinder, form: GrinderForm): Promise<boolean> {
    const patch = grinderPatch(grinder, form);
    if (Object.keys(patch).length === 0) return true;
    return (await this.write('The grinder was not saved', () => this.host.client.updateGrinder(grinder.id, patch))) !== null;
  }

  async archiveGrinder(grinder: Grinder, archived: boolean): Promise<boolean> {
    const what = archived ? 'The grinder was not archived' : 'The grinder was not restored';
    return (await this.write(what, () => this.host.client.updateGrinder(grinder.id, { archived }))) !== null;
  }

  /** The pick for the next shot, in one `PUT /api/v1/workflow`; it stays until it is changed. */
  async pick(pick: NextShotPick): Promise<boolean> {
    this.busy = true;
    this.error = null;
    try {
      this.host.workflow = await this.host.client.updateWorkflow({ context: pickContext(pick) });
      return true;
    } catch (error) {
      this.error = `The pick was not set: ${errorMessage(error)}`;
      return false;
    } finally {
      this.busy = false;
    }
  }
}
