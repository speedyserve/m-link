from knowledge_base import NBO_FAMILY_PRODUCTS, PRODUCT_CATALOGUE, find_product, products_for_nbo_family, products_in_group


def test_catalogue_ids_are_unique():
    ids = [product.product_id for product in PRODUCT_CATALOGUE]
    assert len(ids) == len(set(ids))


def test_nbo_families_map_to_catalogue_products():
    for family, ids in NBO_FAMILY_PRODUCTS.items():
        assert products_for_nbo_family(family), family
        for pid in ids:
            assert find_product(pid) is not None


def test_part_a_groups_are_populated():
    for group in ["DEPOSIT", "CARD", "LOAN", "BANCA", "FX", "INVEST"]:
        assert products_in_group(group), group
