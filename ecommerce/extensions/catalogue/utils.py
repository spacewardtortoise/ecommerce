from __future__ import unicode_literals

from hashlib import md5

from oscar.core.loading import get_model

from ecommerce.core.constants import ENROLLMENT_CODE_PRODUCT_CLASS_NAME, SEAT_PRODUCT_CLASS_NAME

Catalog = get_model('catalogue', 'Catalog')
StockRecord = get_model('partner', 'StockRecord')


def generate_sku(product, partner):
    """
    Generates a SKU for the given partner and and product combination.

    Example: 76E4E71
    """
    product_class = product.get_product_class()

    if not product_class:
        raise AttributeError('Product has no product class')

    if product_class.name == 'Coupon':
        _hash = ' '.join((
            unicode(product.id),
            str(partner.id)
        ))
    elif product_class.name == ENROLLMENT_CODE_PRODUCT_CLASS_NAME:
        _hash = ' '.join((
            getattr(product.attr, 'course_key', ''),
            getattr(product.attr, 'seat_type', ''),
            unicode(partner.id)
        ))
    elif product_class.name == SEAT_PRODUCT_CLASS_NAME:
        _hash = ' '.join((
            getattr(product.attr, 'certificate_type', ''),
            product.attr.course_key,
            unicode(product.attr.id_verification_required),
            getattr(product.attr, 'credit_provider', ''),
            str(partner.id)
        ))
    else:
        raise Exception('Unexpected product class')

    md5_hash = md5(_hash.lower())
    digest = md5_hash.hexdigest()[-7:]

    return digest.upper()


def get_or_create_catalog(name, partner, stock_record_ids):
    """
    Returns the catalog which has the same name, partner and stock records.
    If there isn't one with that data, creates and returns a new one.
    """
    catalogs = Catalog.objects.all()
    stock_records = [StockRecord.objects.get(id=id) for id in stock_record_ids]  # pylint: disable=redefined-builtin

    for catalog in catalogs:
        if catalog.name == name and catalog.partner == partner:
            if set(catalog.stock_records.all()) == set(stock_records):
                return catalog, False

    catalog = Catalog.objects.create(name=name, partner=partner)
    for stock_record in stock_records:
        catalog.stock_records.add(stock_record)
    return catalog, True
