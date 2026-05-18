import { loadAll, type ProductMeta } from './loader';

export class KnowledgeService {
  private products: ProductMeta[];

  constructor() {
    this.products = loadAll();
  }

  getProductLines(): Array<{ name: string; baseUrl?: string }> {
    return this.products.map((p) => ({ name: p.name, baseUrl: p.baseUrl }));
  }

  getKnowledgeContent(productLine: string): string | null {
    const product = this.products.find((p) => p.name === productLine);
    return product?.content ?? null;
  }

  getBaseUrl(productLine: string): string | undefined {
    const product = this.products.find((p) => p.name === productLine);
    return product?.baseUrl;
  }

  buildContext(productLine: string): string {
    const content = this.getKnowledgeContent(productLine);
    if (!content) return '';

    const product = this.products.find((p) => p.name === productLine);
    return [
      `## 产品知识库: ${productLine}`,
      content,
    ].join('\n');
  }
}
