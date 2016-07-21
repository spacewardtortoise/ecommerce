define([
        'jquery',
        'underscore.string',
        'models/coupon_model',
        'views/coupon_detail_view',
        'test/mock_data/coupons',
        'test/spec-utils',
        'moment',
    ],
    function ($,
              _s,
              Coupon,
              CouponDetailView,
              Mock_Coupons,
              SpecUtils,
              moment) {
        'use strict';

        describe('coupon detail view', function() {
            var data,
                enrollmentCodeVoucher,
                lastEditData,
                model,
                percentageDiscountCodeVoucher,
                valueDiscountCodeVoucher,
                verifiedSeat,
                view;

            beforeEach(function () {
                data = Mock_Coupons.enrollmentCodeCouponData;
                model = Coupon.findOrCreate(data, {parse: true});
                view = new CouponDetailView({model: model});
                enrollmentCodeVoucher = Mock_Coupons.enrollmentCodeVoucher;
                lastEditData = Mock_Coupons.lastEditData;
                percentageDiscountCodeVoucher = Mock_Coupons.percentageDiscountCodeVoucher;
                valueDiscountCodeVoucher = Mock_Coupons.valueDiscountCodeVoucher;
                verifiedSeat = Mock_Coupons.verifiedSeat;
            });

            it('should get code status from voucher data', function () {
                expect(view.codeStatus(enrollmentCodeVoucher)).toBe('ACTIVE');

                enrollmentCodeVoucher.end_datetime = moment().fromNow();
                expect(view.codeStatus(enrollmentCodeVoucher)).toBe('INACTIVE');

                enrollmentCodeVoucher.start_datetime = moment().toNow();
                enrollmentCodeVoucher.end_datetime = moment(enrollmentCodeVoucher.start_datetime).toNow();
                expect(view.codeStatus(enrollmentCodeVoucher)).toBe('INACTIVE');
            });

            it('should get coupon type from voucher data', function () {
                expect(view.couponType(percentageDiscountCodeVoucher)).toBe('Discount Code');
                expect(view.couponType(enrollmentCodeVoucher)).toBe('Enrollment Code');
            });

            it('should get discount value from voucher data', function () {
                expect(view.discountValue(percentageDiscountCodeVoucher)).toBe('50%');
                expect(view.discountValue(valueDiscountCodeVoucher)).toBe('$12');
                expect(view.discountValue(enrollmentCodeVoucher)).toBe('100%');
            });

            it('should format date time as MM/DD/YYYY h:mm A', function () {
                expect(view.formatDateTime('2015-01-01T00:00:00Z')).toBe('01/01/2015 12:00 AM');
            });

            it('should format last edit data', function () {
                expect(view.formatLastEditedData(lastEditData)).toBe('user - 01/15/2016 7:26 AM');
            });

            it('should get usage limitation from voucher data', function () {
                expect(view.usageLimitation(enrollmentCodeVoucher)).toBe('Can be used once by one customer');
                expect(view.usageLimitation(valueDiscountCodeVoucher)).toBe('Can be used once by multiple customers');

                valueDiscountCodeVoucher.usage = 'Multi-use';
                expect(view.usageLimitation(valueDiscountCodeVoucher)).toBe(
                    'Can be used multiple times by multiple customers'
                );

                valueDiscountCodeVoucher.usage = '';
                expect(view.usageLimitation(valueDiscountCodeVoucher)).toBe('');
            });

            it('should format tax deducted source value.', function() {
                expect(view.taxDeductedSource(50)).toBe('50%');
                expect(view.taxDeductedSource()).toBe(null);
            });

            it('should display correct data upon rendering', function () {
                var voucher = model.get('vouchers')[0],
                    category = model.get('category');

                spyOn(view, 'renderVoucherTable');
                view.render();
                expect(view.$('.coupon-title').text()).toEqual(model.get('title'));
                expect(view.$('.coupon-type').text()).toEqual(view.couponType(voucher));
                expect(view.$('.code-status').text()).toEqual(view.codeStatus(voucher));
                expect(view.$('.coupon-information > .heading > .pull-right > span').text()).toEqual(
                    view.formatLastEditedData(model.get('last_edited'))
                );
                expect(view.$('.category > .value').text()).toEqual(category);
                expect(view.$('.discount-value > .value').text()).toEqual(view.discountValue(voucher));
                expect(view.$('.course-info > .value').contents().get(0).nodeValue).toEqual(
                    'course-v1:edX+DemoX+Demo_Course'
                );
                expect(view.$('.course-info > .value > .pull-right').text()).toEqual('verified');
                expect(view.$('.start-date-info > .value').text()).toEqual(
                    view.formatDateTime(voucher.start_datetime)
                );
                expect(view.$('.end-date-info > .value').text()).toEqual(
                    view.formatDateTime(voucher.end_datetime)
                );
                expect(view.$('.usage-limitations > .value').text()).toEqual(view.usageLimitation(voucher));
                expect(view.$('.client-info > .value').text()).toEqual(model.get('client'));
                expect(view.$('.invoiced-amount > .value').text()).toEqual(
                    _s.sprintf('$%s', model.get('price'))
                );
                expect(parseInt(view.$('.max-uses > .value').text())).toEqual(parseInt(model.get('max_uses')));
                expect(view.renderVoucherTable).toHaveBeenCalled();
                expect(view.$('.invoice-type > .value').text()).toEqual(model.get('invoice_type'));
                expect(view.$('.invoice-number > .value').text()).toEqual(model.get('invoice_number'));
                expect(view.$('.invoice-payment-date > .value').text()).toEqual(
                    view.formatDateTime(model.get('invoice_payment_date'))
                );
                expect(view.$('.invoice-discount-value > .value').text()).toEqual(
                    view.invoiceDiscountValue(
                        model.get('invoice_discount_type'),
                        model.get('invoice_discount_value')
                    )
                );
                expect(view.$('.tax-deducted-source-value > .value').text()).toEqual(
                    view.taxDeductedSource(model.get('tax_deducted_source'))
                );
                expect(view.$('.seat-types > .value').text()).toEqual('');
                expect(view.$('.catalog-query > .value').text()).toEqual('');
            });

            it('should not display invoice discount type on render.', function() {
                data = Mock_Coupons.enrollmentCodeCouponData;
                data.invoice_discount_value = null;
                model = Coupon.findOrCreate(data, {parse: true});
                view = new CouponDetailView({model: model});
                view.render();
                expect(view.$('.invoice-discount-value > .value').text()).toEqual('');
                expect(view.$('.invoice-discount-type > .value').text()).toEqual('');
            });

            it('should format seat types.', function() {
                view.model.unset('course_seat_types');
                expect(view.formatSeatTypes()).toEqual(null);

                view.model.set({'course_seat_types': ['verified']});
                expect(view.formatSeatTypes()).toEqual('verified');

                view.model.set({'course_seat_types': ['verified', 'professional']});
                expect(view.formatSeatTypes()).toEqual('verified, professional');
            });

            it('should render course data', function () {
                view.model.set({
                    'catalog_type': 'Single course',
                    'course_id': 'a/b/c',
                    'seat_type': 'Verified',
                    'course_seat_types': ['verified']
                });

                view.render();

                var course_info = view.$('.course-info .value');
                expect(course_info.length).toEqual(1);
                expect(course_info.text()).toEqual('a/b/cVerified');
                expect(view.$('.seat-types .value').text()).toEqual('verified');

                view.model.set({
                    'catalog_type': 'Multiple courses',
                    'catalog_query': 'id:*',
                    'course_seat_types': ['verified', 'professional']
                });

                view.render();

                expect(view.$('.catalog-query .value').text()).toEqual('id:*');
                expect(view.$('.seat-types .value').text()).toEqual('verified, professional');
            });

            it('should render prepaid invoice data.', function() {
                view.model.set({
                    'invoice_type': 'Prepaid',
                    'invoice_number': 'INV-001',
                    'price': 1000,
                    'invoice_payment_date': new Date(2016, 1, 1, 1, 0, 0)
                });
                view.render();

                expect(view.$('.invoice-number .value').text()).toEqual(model.get('invoice_number'));
                expect(view.$('.invoiced-amount .value').text()).toEqual(
                    _s.sprintf('$%s', model.get('price'))
                );
                expect(view.$('.invoice-payment-date .value').text()).toEqual(
                    view.formatDateTime(model.get('invoice_payment_date'))
                );
                expect(SpecUtils.visibleElement(view, '.invoice_discount_type', '.info-item')).toBe(false);
                expect(SpecUtils.visibleElement(view, '.invoice_discount_value', '.info-item')).toBe(false);
            });

            it('should render postpaid invoice data.', function() {
                view.model.set({
                    'invoice_type': 'Postpaid',
                    'invoice_discount_type': 'Percentage',
                    'invoice_discount_value': 50,
                });
                view.render();
                expect(view.$('.invoice-discount-type .value').text()).toEqual(model.get('invoice_discount_type'));
                expect(view.$('.invoice-discount-value .value').text()).toEqual(
                    view.invoiceDiscountValue(
                        model.get('invoice_discount_type'),
                        model.get('invoice_discount_value')
                    )
                );
                expect(SpecUtils.visibleElement(view, '.invoice-number', '.info-item')).toBe(false);
                expect(SpecUtils.visibleElement(view, '.invoiced-amount', '.info-item')).toBe(false);
                expect(SpecUtils.visibleElement(view, '.invoice-payment-date', '.info-item')).toBe(false);
            });

            it('should render not-applicable invoice data.', function() {
                view.model.set('invoice_type', 'Not-Applicable');
                view.render();
                expect(SpecUtils.visibleElement(view, '.invoice_discount_type', '.info-item')).toBe(false);
                expect(SpecUtils.visibleElement(view, '.invoice-number', '.info-item')).toBe(false);
                expect(SpecUtils.visibleElement(view, '.invoiced-amount', '.info-item')).toBe(false);
                expect(SpecUtils.visibleElement(view, '.invoice-payment-date', '.info-item')).toBe(false);
            });

            it('should display tax deducted source input field.', function() {
                view.model.set('tax_deduction', 'Yes');
                view.render();
                expect(SpecUtils.visibleElement(view, '.tax-deducted-source-value', '.info-item')).toBe(true);

                view.model.set('tax_deduction', 'No');
                view.render();
                expect(SpecUtils.visibleElement(view, '.tax-deducted-source-value', '.info-item')).toBe(false);
            });

            it('should display data table', function () {
                view.renderVoucherTable();
                expect(view.$('#vouchersTable').DataTable().autowidth).toBeFalsy();
                expect(view.$('#vouchersTable').DataTable().paging).toBeFalsy();
                expect(view.$('#vouchersTable').DataTable().ordering).toBeFalsy();
                expect(view.$('#vouchersTable').DataTable().searching).toBeFalsy();
            });

            it('should download voucher report in the new tab', function () {
                var e = $.Event('click'),
                    url = _s.sprintf('/api/v2/coupons/coupon_reports/%d', model.id);
                spyOn(e, 'preventDefault');
                spyOn(window, 'open');
                view.downloadCouponReport(e);
                expect(e.preventDefault).toHaveBeenCalled();
                expect(window.open).toHaveBeenCalledWith(url, '_blank');
            });
        });
    }
);
