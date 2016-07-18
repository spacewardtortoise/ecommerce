from factory.django import mute_signals
from django.core.urlresolvers import reverse

from oscar.test import factories
from oscar.core.loading import get_class, get_model
from oscar.test.contextmanagers import mock_signal_receiver

from ecommerce.extensions.fulfillment.status import ORDER
from ecommerce.extensions.payment.processors.cybersource import Cybersource
from ecommerce.extensions.payment.tests.mixins import PaymentEventsMixin, CybersourceMixin
from ecommerce.extensions.payment.management.commands.orders_with_multiple_payments import Command
from ecommerce.tests.testcases import TestCase

Basket = get_model('basket', 'Basket')
Order = get_model('order', 'Order')
PaymentEvent = get_model('order', 'PaymentEvent')
PaymentEventType = get_model('order', 'PaymentEventType')
PaymentProcessorResponse = get_model('payment', 'PaymentProcessorResponse')
SourceType = get_model('payment', 'SourceType')

post_checkout = get_class('checkout.signals', 'post_checkout')


class TestOrdersWithMultiplePaymentsCommand(CybersourceMixin, PaymentEventsMixin, TestCase):
    """ Test processing of orders_with_multiple_payments command """

    def setUp(self):
        super(TestOrdersWithMultiplePaymentsCommand, self).setUp()
        self.user = factories.UserFactory()
        self.billing_address = self.make_billing_address()

        self.basket = factories.create_basket()
        self.basket.owner = self.user
        self.basket.freeze()

        self.processor = Cybersource()
        self.processor_name = self.processor.NAME

    @mute_signals(post_checkout)
    def test_number_of_payments(self):
        """
        Tests the processing of 'number_of_payments_for_order' function.
        """
        notification = self.generate_notification(
            self.processor.secret_key,
            self.basket,
            billing_address=self.billing_address,
        )
        with mock_signal_receiver(post_checkout):
            response = self.client.post(reverse('cybersource_notify'), notification)
        self.assertEqual(response.status_code, 200)
        order = Order.objects.get(basket=self.basket)
        self.assertIsNotNone(order, 'No order was created for the basket after payment.')
        self.assertEqual(order.status, ORDER.OPEN)
        self.assertEquals(Command.number_of_payments_for_order(order), 1)
        response = PaymentProcessorResponse.objects.get(basket_id=order.basket_id)
        response.id += 1
        response.save()
        self.assertEquals(Command.number_of_payments_for_order(order), 2)
