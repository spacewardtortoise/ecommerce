import datetime
import json

import httpretty
from django.conf import settings
from django.test import RequestFactory
from oscar.test import factories

from ecommerce.core.models import BusinessClient
from ecommerce.extensions.basket.utils import prepare_basket
from ecommerce.extensions.catalogue.utils import create_coupon_product
from ecommerce.extensions.checkout.mixins import EdxOrderPlacementMixin
from ecommerce.tests.factories import PartnerFactory
from ecommerce.tests.mixins import ProductClass, Catalog, Benefit, Voucher, Applicator


class CourseCatalogMockMixin(object):
    """ Mocks for the Course Catalog responses. """

    def setUp(self):
        super(CourseCatalogMockMixin, self).setUp()

    def mock_dynamic_catalog_course_runs_api(self, course_run=None, query=None, course_run_info=None):
        """ Helper function to register a dynamic course catalog API endpoint for the course run information. """
        if not course_run_info:
            course_run_info = {
                'count': 1,
                'results': [{
                    'key': course_run.id,
                    'title': course_run.name,
                    'start': '2016-05-01T00:00:00Z',
                    'image': {
                        'src': 'path/to/the/course/image'
                    }
                }] if course_run else [{
                    'key': 'test',
                    'title': 'Test course',
                }],
            }
        course_run_info_json = json.dumps(course_run_info)
        course_run_url = '{}course_runs/?q={}'.format(
            settings.COURSE_CATALOG_API_URL,
            query if query else 'id:course*'
        )
        httpretty.register_uri(
            httpretty.GET, course_run_url,
            body=course_run_info_json,
            content_type='application/json'
        )

    def mock_dynamic_catalog_contains_api(self, course_run_ids, query):
        """ Helper function to register a dynamic course catalog API endpoint for the contains information. """
        course_contains_info = {
            'course_runs': {}
        }
        for course_run_id in course_run_ids:
            course_contains_info['course_runs'][course_run_id] = True

        course_run_info_json = json.dumps(course_contains_info)
        course_run_url = '{}course_runs/contains/?course_run_ids={}&query={}'.format(
            settings.COURSE_CATALOG_API_URL,
            (course_run_id for course_run_id in course_run_ids),
            query if query else 'id:course*'
        )
        httpretty.register_uri(
            httpretty.GET, course_run_url,
            body=course_run_info_json,
            content_type='application/json'
        )


class CouponMixin(object):
    """ Mixin for preparing data for coupons and creating coupons. """

    REDEMPTION_URL = "/coupons/offer/?code={}"

    def setUp(self):
        super(CouponMixin, self).setUp()
        self.category = factories.CategoryFactory()

        # Force the creation of a coupon ProductClass
        self.coupon_product_class  # pylint: disable=pointless-statement

    @property
    def coupon_product_class(self):
        defaults = {'requires_shipping': False, 'track_stock': False, 'name': 'Coupon'}
        pc, created = ProductClass.objects.get_or_create(name='Coupon', slug='coupon', defaults=defaults)

        if created:
            factories.ProductAttributeFactory(
                code='coupon_vouchers',
                name='Coupon vouchers',
                product_class=pc,
                type='entity'
            )
            factories.ProductAttributeFactory(
                code='note',
                name='Note',
                product_class=pc,
                type='text'
            )

        return pc

    def apply_voucher(self, user, site, voucher):
        """ Apply the voucher to a basket. """
        basket = factories.BasketFactory(owner=user, site=site)
        product = voucher.offers.first().benefit.range.all_products()[0]
        basket.add_product(product)
        basket.vouchers.add(voucher)
        Applicator().apply(basket, self.user)
        return basket

    def create_coupon(self, title='Test coupon', price=100, client=None, partner=None, catalog=None, code='',
                      benefit_value=100, note=None, max_uses=None, quantity=5, catalog_query=None,
                      course_seat_types=None):
        """Helper method for creating a coupon.

        Arguments:
            title(str): Title of the coupon
            price(int): Price of the coupon
            partner(Partner): Partner used for creating a catalog
            catalog(Catalog): Catalog of courses for which the coupon applies
            code(str): Custom coupon code
            benefit_value(int): The voucher benefit value
            catalog_query(str): Course query string
            course_seat_types(str): A string of comma-separated list of seat types

        Returns:
            coupon (Coupon)

        """
        if partner is None:
            partner = PartnerFactory(name='Tester')
        if client is None:
            client, __ = BusinessClient.objects.get_or_create(name='Test Client')
        if catalog is None and not (catalog_query and course_seat_types):
            catalog = Catalog.objects.create(partner=partner)
        if code is not '':
            quantity = 1

        coupon = create_coupon_product(
            benefit_type=Benefit.PERCENTAGE,
            benefit_value=benefit_value,
            catalog=catalog,
            catalog_query=catalog_query,
            category=self.category,
            code=code,
            course_seat_types=course_seat_types,
            end_datetime=datetime.date(2020, 1, 1),
            max_uses=max_uses,
            note=note,
            partner=partner,
            price=price,
            quantity=quantity,
            start_datetime=datetime.date(2015, 1, 1),
            title=title,
            voucher_type=Voucher.SINGLE_USE
        )

        request = RequestFactory()
        request.site = self.site
        request.user = factories.UserFactory()
        request.COOKIES = {}

        self.basket = prepare_basket(request, coupon)

        self.response_data = EdxOrderPlacementMixin().create_order_for_invoice(
            basket=self.basket,
            client=client,
            coupon_id=coupon.id,
            invoice_data={}
        )
        coupon.client = client

        return coupon
