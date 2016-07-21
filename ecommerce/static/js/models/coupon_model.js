define([
        'backbone',
        'backbone.super',
        'backbone.validation',
        'jquery',
        'js-cookie',
        'underscore',
        'moment',
        'collections/category_collection',
        'models/category',
        'utils/validation_patterns'
    ],
    function (Backbone,
              BackboneSuper,
              BackboneValidation,
              $,
              Cookies,
              _,
              moment
              ) {
        'use strict';

        _.extend(Backbone.Validation.messages, {
            required: gettext('This field is required.'),
            number: gettext('This value must be a number.'),
            date: gettext('This value must be a date.'),
            seat_types: gettext('At least one seat type must be selected.'),
        });
        _.extend(Backbone.Model.prototype, Backbone.Validation.mixin);

        return Backbone.RelationalModel.extend({
            urlRoot: '/api/v2/coupons/',

            defaults: {
                category: {id: 3, name: 'Affiliate Promotion'},
                code: '',
                course_seats: [],
                course_seat_types: [],
                id: null,
                max_uses: 1,
                price: 0,
                quantity: 1,
                seats: [],
                stock_record_ids: [],
                total_value: 0,
            },

            validation: {
                category: {required: true},
                course_id: {
                    pattern: 'courseId',
                    msg: gettext('A valid course ID is required'),
                    required: function () {
                        return this.get('catalog_type') === 'Single course';
                    }
                },
                title: {required: true},
                client: {required: true},
                // seat_type is for validation only, stock_record_ids holds the values
                seat_type: {
                    required: function () {
                        return this.get('catalog_type') === 'Single course';
                    }
                },
                quantity: {pattern: 'number'},
                benefit_value: {
                    pattern: 'number',
                    required: function () {
                        return this.get('coupon_type') === 'Discount code';
                    }
                },
                invoice_type: {required: true},
                invoice_number: {
                    required: function() {
                        return this.isPrepaidInvoiceType();
                    }
                },
                price: {
                    pattern: 'number',
                    required: function() {
                        return this.isPrepaidInvoiceType();
                    }
                },
                invoice_payment_date: {
                    required: function() {
                        return this.isPrepaidInvoiceType();
                    }
                },
                invoice_discount_value: {
                    pattern: 'number',
                    required: function () {
                        return this.get('invoice_type') === 'Postpaid';
                    }
                },
                code: {
                    pattern: /^[a-zA-Z0-9]+$/,
                    required: false,
                    rangeLength: [1, 16],
                    msg: gettext('This field must be empty or contain 1-16 alphanumeric characters.')
                },
                catalog_query: {
                    required: function () {
                        return this.get('catalog_type') === 'Multiple courses';
                    }
                },
                course_seat_types: function (val) {
                    if (this.get('catalog_type') === 'Multiple courses' && val.length === 0) {
                        return Backbone.Validation.messages.seat_types;
                    }
                },
                start_date: function (val) {
                    var startDate,
                        endDate;
                    if (_.isEmpty(val)) {
                        return Backbone.Validation.messages.required;
                    }
                    startDate = moment(new Date(val));
                    if (!startDate.isValid()) {
                        return Backbone.Validation.messages.date;
                    }
                    endDate = moment(this.get('end_date'));
                    if (endDate && startDate.isAfter(endDate)) {
                        return gettext('Must occur before end date');
                    }
                },
                end_date: function (val) {
                    var startDate,
                        endDate;
                    if (_.isEmpty(val)) {
                        return Backbone.Validation.messages.required;
                    }
                    endDate = moment(new Date(val));
                    if (!endDate.isValid()) {
                        return Backbone.Validation.messages.date;
                    }
                    startDate = moment(new Date(this.get('start_date')));
                    if (startDate && endDate.isBefore(startDate)) {
                        return gettext('Must occur after start date');
                    }
                }
            },

            initialize: function () {
                this.on('change:voucher_type', this.changeVoucherType, this);
                this.on('change:vouchers', this.updateVoucherData);
                this.on('change:seats', this.updateSeatData);
                this.on('change:quantity', this.updateTotalValue(this.getSeatPrice));
                this.on('change:payment_information', this.updatePaymentInformation);
            },

            isPrepaidInvoiceType: function() {
                return this.get('invoice_type') === 'Prepaid';
            },

            /**
             * When user selects the 'Single use' limitation option set quantity to '1'.
             */
            changeVoucherType: function (model, value) {
                if (value === 'Single use') {
                    this.set('quantity', 1);
                }
            },

            getSeatPrice: function () {
                var seats = this.get('seats');
                return seats[0] ? seats[0].price : '';
            },

            updateTotalValue: function (seat_price) {
                this.set('total_value', this.get('quantity') * seat_price);
            },

            getCertificateType: function(seat_data) {
                var seat_type = _.findWhere(seat_data, {'name': 'certificate_type'});
                return seat_type ? seat_type.value : '';
            },

            getCourseID: function(seat_data) {
                var course_id = _.findWhere(seat_data, {'name': 'course_key'});
                return course_id ? course_id.value : '';
            },

            updateSeatData: function () {
                var seat_data,
                    seats = this.get('seats');

                this.set('catalog_type', this.has('catalog_query') ? 'Multiple courses': 'Single course');

                if (this.get('catalog_type') === 'Single course') {
                    if (seats[0]) {
                        seat_data = seats[0].attribute_values;

                        this.set('seat_type', this.getCertificateType(seat_data));
                        this.set('course_id', this.getCourseID(seat_data));
                        this.updateTotalValue(this.getSeatPrice());
                    }
                }
            },

            updateVoucherData: function () {
                var vouchers = this.get('vouchers'),
                    voucher = vouchers[0],
                    code_count = _.findWhere(voucher, {'code': voucher.code});
                this.set('start_date', voucher.start_datetime);
                this.set('end_date', voucher.end_datetime);
                this.set('voucher_type', voucher.usage);
                this.set('quantity', _.size(vouchers));
                this.updateTotalValue(this.getSeatPrice());
                if (this.get('coupon_type') === 'Discount code') {
                    this.set('benefit_type', voucher.benefit.type);
                    this.set('benefit_value', voucher.benefit.value);
                }

                if (code_count > 1 || _.size(vouchers) === 1) {
                    this.set('code', voucher.code);
                }

                if (voucher.usage === 'Single use') {
                    this.set('max_uses', 1);
                }
            },

            updatePaymentInformation: function() {
                var payment_information = this.get('payment_information'),
                    invoice = payment_information.Invoice,
                    tax_deducted = invoice.tax_deducted_source ? 'Yes' : 'No';
                this.set({
                    'invoice_type': invoice.type,
                    'invoice_discount_type': invoice.discount_type,
                    'invoice_discount_value': invoice.discount_value,
                    'invoice_number': invoice.number,
                    'invoice_payment_date': invoice.payment_date,
                    'tax_deducted_source': invoice.tax_deducted_source,
                    'tax_deduction': tax_deducted,
                });
            },

            save: function (attributes, options) {
                _.defaults(options || (options = {}), {
                    // The API requires a CSRF token for all POST requests using session authentication.
                    headers: {'X-CSRFToken': Cookies.get('ecommerce_csrftoken')},
                    contentType: 'application/json'
                });

                if (!options.patch){
                    this.set('start_datetime', moment.utc(this.get('start_date')));
                    this.set('end_datetime', moment.utc(this.get('end_date')));

                    if (this.get('coupon_type') === 'Enrollment code') {
                        this.set('benefit_type', 'Percentage');
                        this.set('benefit_value', 100);
                    }

                    options.data = JSON.stringify(this.toJSON());
                } else {
                    if (_.has(attributes, 'start_date')) {
                        attributes.start_datetime = moment.utc(attributes.start_date);
                        delete attributes.start_date;
                    }

                    if (_.has(attributes, 'end_date')) {
                        attributes.end_datetime = moment.utc(attributes.end_date);
                        delete attributes.end_date;
                    }

                    if (_.has(attributes, 'title')) {
                        attributes.name = attributes.title;
                    }
                }

                return this._super(attributes, options);
            }
        });
    }
);
